import { NextRequest } from "next/server";
import { requireUser, resolveKubeconfig } from "@/lib/auth/resolve";
import { assertSandboxAllowed } from "@/lib/apikey/access";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertOwnedBy } from "@/lib/sandbox/ownership";
import { withSandboxIdle } from "@/lib/sandbox/idle";
import { withSandboxTags } from "@/lib/sandbox/tags";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";
import { toSandbox } from "@/lib/sealos/map";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const kubeconfig = await resolveKubeconfig();
    const client = createLaunchpadClient({ kubeconfig });
    const existing = await client.getApp(id);
    assertOwnedBy(existing, user.username);
    assertSandboxAllowed(user, id);
    await client.pauseApp(id);
    const app = await client.getApp(id);
    const [sandbox] = await withSandboxIdle(
      user.username,
      await withSandboxTags(user.username, [toSandbox(app)]),
    );
    return jsonOk({ sandbox });
  } catch (error) {
    return jsonError(error);
  }
}
