import { requireUser, resolveKubeconfig } from "@/lib/auth/resolve";
import { assertSandboxAllowed } from "@/lib/apikey/access";
import { assertOwnedBy } from "@/lib/sandbox/ownership";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";
import { SealosApiError } from "@/lib/sealos/errors";
import { listAppPods } from "@/lib/sealos/kube";

/** 确认当前用户可以在这台运行中的沙箱里执行命令。 */
export async function resolveRunningSandbox(id: string) {
  const user = await requireUser();
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
  return { kubeconfig, pod: selected.name, container: selected.container };
}
