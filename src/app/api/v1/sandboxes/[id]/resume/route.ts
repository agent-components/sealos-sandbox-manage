import { NextRequest } from "next/server";
import { requireUser, resolveSandboxRegion } from "@/lib/auth/resolve";
import { assertSandboxAllowed } from "@/lib/apikey/access";
import { runSandboxApiCall } from "@/lib/api/call-context";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertOwnedBy } from "@/lib/sandbox/ownership";
import {
  touchSandboxActivity,
  withSandboxIdle,
} from "@/lib/sandbox/idle";
import { setSandboxState } from "@/lib/sandbox/record";
import {
  attachRegion,
  launchpadClientFor,
} from "@/lib/sandbox/region-fields";
import { withSandboxTags } from "@/lib/sandbox/tags";
import {
  reconcileSandboxUsage,
  snapshotFromApp,
} from "@/lib/billing/meter";
import { mapLaunchpadStatus, toSandbox } from "@/lib/sealos/map";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return await runSandboxApiCall({
      req,
      tool: "resumeSandbox",
      method: "POST",
      path: "/sandboxes/{id}/resume",
      arguments: { id },
      run: async () => {
        const user = await requireUser(req);
        const region = await resolveSandboxRegion(id);
        const client = launchpadClientFor(region);
        const existing = await client.getApp(id);
        const templateId = await assertOwnedBy(existing, user.username);
        assertSandboxAllowed(user, id);
        await client.startApp(id);
        const app = await client.getApp(id);
        await setSandboxState(id, mapLaunchpadStatus(app.status));
        await touchSandboxActivity(id);
        await reconcileSandboxUsage(snapshotFromApp(app, user.username));
        const [sandbox] = await withSandboxIdle(
          user.username,
          await withSandboxTags(user.username, [
            attachRegion(toSandbox(app, templateId), region.id),
          ]),
        );
        const body = { sandbox };
        return { status: 200, result: body, value: jsonOk(body) };
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
