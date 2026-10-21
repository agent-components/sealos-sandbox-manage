import { NextRequest } from "next/server";
import { requireUser, resolveKubeconfig } from "@/lib/auth/resolve";
import { assertSandboxAllowed } from "@/lib/apikey/access";
import { revokeSandboxFromApiKeys } from "@/lib/apikey/store";
import { runSandboxApiCall } from "@/lib/api/call-context";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  deleteSandboxIdle,
  setSandboxIdleConfig,
  withSandboxIdle,
} from "@/lib/sandbox/idle";
import { assertOwnedBy } from "@/lib/sandbox/ownership";
import { deleteSandboxRecord } from "@/lib/sandbox/record";
import { DEFAULT_IDLE_CONFIG, UpdateSandboxSchema } from "@/lib/sandbox/schema";
import { setSandboxTags, withSandboxTags } from "@/lib/sandbox/tags";
import { AuthError } from "@/lib/sealos/errors";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";
import { toSandbox } from "@/lib/sealos/map";
import { getTemplate } from "@/lib/template/store";

async function withSandboxExtras(owner: string, sandbox: ReturnType<typeof toSandbox>) {
  const [enriched] = await withSandboxIdle(
    owner,
    await withSandboxTags(owner, [sandbox]),
  );
  return enriched!;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return await runSandboxApiCall({
      req,
      tool: "getSandbox",
      method: "GET",
      path: "/sandboxes/{id}",
      arguments: { id },
      sandboxId: id,
      trackActivity: true,
      run: async () => {
        const user = await requireUser();
        const kubeconfig = await resolveKubeconfig();
        const client = createLaunchpadClient({ kubeconfig });
        const app = await client.getApp(id);
        const templateId = await assertOwnedBy(app, user.username);
        assertSandboxAllowed(user, id);
        const body = {
          sandbox: await withSandboxExtras(user.username, toSandbox(app, templateId)),
        };
        return { status: 200, result: body, value: jsonOk(body) };
      },
    });
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
    const templateId = await assertOwnedBy(existing, user.username);
    assertSandboxAllowed(user, id);
    const resourcePatch =
      body.cpu !== undefined &&
      body.memoryGi !== undefined &&
      body.diskGi !== undefined
        ? {
            cpu: body.cpu,
            memoryGi: body.memoryGi,
            diskGi: body.diskGi,
          }
        : undefined;

    let app = existing;
    if (body.applyTemplate) {
      if (!templateId) {
        throw new AuthError("该沙箱未关联模板，无法从模板更新", 400);
      }
      const template = await getTemplate(templateId);
      if (!template) {
        throw new AuthError(`模板「${templateId}」不存在或已删除`, 404);
      }
      app = await client.syncAppFromTemplate(id, existing, template, {
        ...(body.env !== undefined ? { env: body.env } : {}),
        ...(resourcePatch
          ? {
              resources: {
                ...resourcePatch,
                replicas: Math.max(1, Math.round(existing.quota?.replicas ?? 1)),
              },
            }
          : {}),
      });
      if (body.autoShutdown === undefined && body.idleMinutes === undefined) {
        await setSandboxIdleConfig(user.username, id, {
          autoShutdown:
            template.autoShutdown ?? DEFAULT_IDLE_CONFIG.autoShutdown,
          idleMinutes:
            template.idleMinutes ?? DEFAULT_IDLE_CONFIG.idleMinutes,
        });
      }
    } else if (resourcePatch || body.env !== undefined) {
      app = await client.updateApp(id, {
        ...(resourcePatch ? { resources: resourcePatch } : {}),
        ...(body.env !== undefined ? { env: body.env } : {}),
      });
    }

    if (body.tags !== undefined) {
      await setSandboxTags(user.username, id, body.tags);
    }
    if (body.autoShutdown !== undefined || body.idleMinutes !== undefined) {
      const current = await withSandboxExtras(
        user.username,
        toSandbox(existing, templateId),
      );
      await setSandboxIdleConfig(user.username, id, {
        autoShutdown: body.autoShutdown ?? current.autoShutdown ?? DEFAULT_IDLE_CONFIG.autoShutdown,
        idleMinutes: body.idleMinutes ?? current.idleMinutes ?? DEFAULT_IDLE_CONFIG.idleMinutes,
      });
    }
    return jsonOk({
      sandbox: await withSandboxExtras(user.username, toSandbox(app, templateId)),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return await runSandboxApiCall({
      req,
      tool: "deleteSandbox",
      method: "DELETE",
      path: "/sandboxes/{id}",
      arguments: { id },
      sandboxId: id,
      trackActivity: true,
      run: async () => {
        const user = await requireUser();
        const kubeconfig = await resolveKubeconfig();
        const client = createLaunchpadClient({ kubeconfig });
        const existing = await client.getApp(id);
        await assertOwnedBy(existing, user.username);
        assertSandboxAllowed(user, id);
        await client.deleteApp(id);
        await deleteSandboxRecord(id);
        await deleteSandboxIdle(user.username, id);
        await revokeSandboxFromApiKeys(user.username, id);
        const body = { ok: true as const };
        return { status: 200, result: body, value: jsonOk(body) };
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
