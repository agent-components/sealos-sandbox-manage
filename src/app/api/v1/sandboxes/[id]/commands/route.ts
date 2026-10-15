import { NextRequest } from "next/server";
import { requireUser, resolveKubeconfig } from "@/lib/auth/resolve";
import { assertSandboxAllowed } from "@/lib/apikey/access";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertOwnedBy } from "@/lib/sandbox/ownership";
import { RunSandboxCommandSchema } from "@/lib/sandbox/schema";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";
import { SealosApiError } from "@/lib/sealos/errors";
import { execInPod, listAppPods } from "@/lib/sealos/kube";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = RunSandboxCommandSchema.parse(await req.json().catch(() => ({})));
    const kubeconfig = await resolveKubeconfig();
    const client = createLaunchpadClient({ kubeconfig });
    const app = await client.getApp(id);
    assertOwnedBy(app, user.username);
    assertSandboxAllowed(user, id);

    const pods = await listAppPods(kubeconfig, id);
    const selected =
      pods.find((pod) => pod.phase === "Running" && pod.ready) ??
      pods.find((pod) => pod.phase === "Running");
    if (!selected) {
      throw new SealosApiError("沙箱未在运行，无法执行命令", 409);
    }

    const result = await execInPod(kubeconfig, {
      pod: selected.name,
      container: selected.container,
      command: ["/bin/sh", "-c", body.command],
    });
    return jsonOk({
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error) {
    return jsonError(error);
  }
}
