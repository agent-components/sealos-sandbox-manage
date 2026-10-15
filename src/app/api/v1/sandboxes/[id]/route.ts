import { NextRequest } from "next/server";
import { requireUser, resolveKubeconfig } from "@/lib/auth/resolve";
import { assertSandboxAllowed } from "@/lib/apikey/access";
import { revokeSandboxFromApiKeys } from "@/lib/apikey/store";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  deleteSandboxIdle,
  setSandboxIdleConfig,
  withSandboxIdle,
} from "@/lib/sandbox/idle";
import { assertOwnedBy } from "@/lib/sandbox/ownership";
import { DEFAULT_IDLE_CONFIG, UpdateSandboxSchema } from "@/lib/sandbox/schema";
import {
  deleteSandboxTags,
  setSandboxTags,
  withSandboxTags,
} from "@/lib/sandbox/tags";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";
import { toSandbox } from "@/lib/sealos/map";

async function withSandboxExtras(owner: string, sandbox: ReturnType<typeof toSandbox>) {
  const [enriched] = await withSandboxIdle(
    owner,
    await withSandboxTags(owner, [sandbox]),
  );
  return enriched!;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const kubeconfig = await resolveKubeconfig();
    const client = createLaunchpadClient({ kubeconfig });
    const app = await client.getApp(id);
    assertOwnedBy(app, user.username);
    assertSandboxAllowed(user, id);
    return jsonOk({ sandbox: await withSandboxExtras(user.username, toSandbox(app)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = UpdateSandboxSchema.parse(await req.json());
    const kubeconfig = await resolveKubeconfig();
    const client = createLaunchpadClient({ kubeconfig });
    const existing = await client.getApp(id);
    assertOwnedBy(existing, user.username);
    assertSandboxAllowed(user, id);
    const app =
      body.cpu !== undefined &&
      body.memoryGi !== undefined &&
      body.diskGi !== undefined
        ? await client.updateApp(id, {
            cpu: body.cpu,
            memoryGi: body.memoryGi,
            diskGi: body.diskGi,
          })
        : existing;
    if (body.tags !== undefined) {
      await setSandboxTags(user.username, id, body.tags);
    }
    if (body.autoShutdown !== undefined || body.idleMinutes !== undefined) {
      const current = await withSandboxExtras(user.username, toSandbox(existing));
      await setSandboxIdleConfig(user.username, id, {
        autoShutdown: body.autoShutdown ?? current.autoShutdown ?? DEFAULT_IDLE_CONFIG.autoShutdown,
        idleMinutes: body.idleMinutes ?? current.idleMinutes ?? DEFAULT_IDLE_CONFIG.idleMinutes,
      });
    }
    return jsonOk({ sandbox: await withSandboxExtras(user.username, toSandbox(app)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const kubeconfig = await resolveKubeconfig();
    const client = createLaunchpadClient({ kubeconfig });
    const existing = await client.getApp(id);
    assertOwnedBy(existing, user.username);
    assertSandboxAllowed(user, id);
    await client.deleteApp(id);
    await deleteSandboxTags(user.username, id);
    await deleteSandboxIdle(user.username, id);
    await revokeSandboxFromApiKeys(user.username, id);
    return jsonOk({ ok: true as const });
  } catch (error) {
    return jsonError(error);
  }
}
