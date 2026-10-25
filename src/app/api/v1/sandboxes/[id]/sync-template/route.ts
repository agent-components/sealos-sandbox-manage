import { NextRequest } from "next/server";
import { requireUser, resolveKubeconfig } from "@/lib/auth/resolve";
import { assertSandboxAllowed } from "@/lib/apikey/access";
import { runSandboxApiCall } from "@/lib/api/call-context";
import { jsonError, jsonOk } from "@/lib/api/response";
import { setSandboxIdleConfig, withSandboxIdle } from "@/lib/sandbox/idle";
import { assertOwnedBy } from "@/lib/sandbox/ownership";
import { setSandboxState } from "@/lib/sandbox/record";
import { DEFAULT_IDLE_CONFIG } from "@/lib/sandbox/schema";
import { withSandboxTags } from "@/lib/sandbox/tags";
import {
  reconcileSandboxUsage,
  snapshotFromApp,
} from "@/lib/billing/meter";
import { AuthError } from "@/lib/sealos/errors";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";
import { mapLaunchpadStatus, toSandbox } from "@/lib/sealos/map";
import { getTemplate } from "@/lib/template/store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return await runSandboxApiCall({
      req,
      tool: "syncSandboxFromTemplate",
      method: "POST",
      path: "/sandboxes/{id}/sync-template",
      arguments: { id },
      run: async () => {
        const user = await requireUser(req);
        const kubeconfig = await resolveKubeconfig();
        const client = createLaunchpadClient({ kubeconfig });
        const existing = await client.getApp(id);
        const templateId = await assertOwnedBy(existing, user.username);
        assertSandboxAllowed(user, id);

        if (!templateId) {
          throw new AuthError("该沙箱未关联模板，无法从模板更新", 400);
        }

        const template = await getTemplate(templateId);
        if (!template) {
          throw new AuthError(`模板「${templateId}」不存在或已删除`, 404);
        }

        const app = await client.syncAppFromTemplate(id, existing, template);
        await setSandboxState(id, mapLaunchpadStatus(app.status));
        await reconcileSandboxUsage(snapshotFromApp(app, user.username));

        await setSandboxIdleConfig(user.username, id, {
          autoShutdown:
            template.autoShutdown ?? DEFAULT_IDLE_CONFIG.autoShutdown,
          idleMinutes: template.idleMinutes ?? DEFAULT_IDLE_CONFIG.idleMinutes,
        });

        const [sandbox] = await withSandboxIdle(
          user.username,
          await withSandboxTags(user.username, [toSandbox(app, templateId)])
        );
        const body = { sandbox };
        return { status: 200, result: body, value: jsonOk(body) };
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
