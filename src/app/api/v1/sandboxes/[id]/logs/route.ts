import { NextRequest } from "next/server";
import { requireUser, resolveKubeconfig } from "@/lib/auth/resolve";
import { assertSandboxAllowed } from "@/lib/apikey/access";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertOwnedBy } from "@/lib/sandbox/ownership";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";
import { getPodLogs, listAppPods } from "@/lib/sealos/kube";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const kubeconfig = await resolveKubeconfig();
    const client = createLaunchpadClient({ kubeconfig });
    const app = await client.getApp(id);
    await assertOwnedBy(app, user.username);
    assertSandboxAllowed(user, id);

    const pods = await listAppPods(kubeconfig, id);
    if (!pods.length) {
      return jsonOk({
        pods: [],
        pod: null,
        container: null,
        logs: "",
        message: "暂无 Pod，应用可能仍在创建或已关机",
      });
    }

    const sp = req.nextUrl.searchParams;
    const requestedPod = sp.get("pod");
    const tailLines = Number(sp.get("tailLines") ?? "500") || 500;
    const previous = sp.get("previous") === "true";

    const selected =
      pods.find((p) => p.name === requestedPod) ??
      pods.find((p) => p.phase === "Running") ??
      pods[0]!;

    try {
      const { logs } = await getPodLogs(kubeconfig, {
        pod: selected.name,
        container: selected.container,
        tailLines: Math.min(5000, Math.max(50, tailLines)),
        previous,
      });
      return jsonOk({
        pods,
        pod: selected.name,
        container: selected.container,
        logs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "获取日志失败";
      return jsonOk({
        pods,
        pod: selected.name,
        container: selected.container,
        logs: "",
        message,
      });
    }
  } catch (error) {
    return jsonError(error);
  }
}
