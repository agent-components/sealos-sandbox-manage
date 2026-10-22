import { requireUser, resolveKubeconfig } from "@/lib/auth/resolve";
import { assertSandboxAllowed } from "@/lib/apikey/access";
import { assertOwnedBy } from "@/lib/sandbox/ownership";
import { setSandboxState } from "@/lib/sandbox/record";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";
import { SealosApiError } from "@/lib/sealos/errors";
import { listAppPods } from "@/lib/sealos/kube";
import { mapLaunchpadStatus } from "@/lib/sealos/map";

const AUTO_START_TIMEOUT_MS = 180_000;
const AUTO_START_POLL_MS = 2_000;

function pickReadyPod(pods: Awaited<ReturnType<typeof listAppPods>>) {
  return pods.find((pod) => pod.phase === "Running" && pod.ready);
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new SealosApiError("命令已取消", 499));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new SealosApiError("命令已取消", 499));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 确认当前用户可以在这台运行中的沙箱里执行命令。 */
export async function resolveRunningSandbox(id: string) {
  const user = await requireUser();
  const kubeconfig = await resolveKubeconfig();
  const client = createLaunchpadClient({ kubeconfig });
  const app = await client.getApp(id);
  await assertOwnedBy(app, user.username);
  assertSandboxAllowed(user, id);
  await setSandboxState(id, mapLaunchpadStatus(app.status));

  const pods = await listAppPods(kubeconfig, id);
  const selected =
    pickReadyPod(pods) ?? pods.find((pod) => pod.phase === "Running");
  if (!selected) {
    throw new SealosApiError("沙箱未在运行，无法执行命令", 409);
  }
  return { kubeconfig, pod: selected.name, container: selected.container };
}

/**
 * 执行命令前解析沙箱：已停止时先开机，等到 Pod 就绪再返回。
 * REST 与 MCP 共用。最长等待 3 分钟。
 */
export async function resolveSandboxForCommand(
  id: string,
  signal?: AbortSignal
) {
  const user = await requireUser();
  const kubeconfig = await resolveKubeconfig();
  const client = createLaunchpadClient({ kubeconfig });
  let app = await client.getApp(id);
  await assertOwnedBy(app, user.username);
  assertSandboxAllowed(user, id);

  let state = mapLaunchpadStatus(app.status);
  let lastWritten = state;
  await setSandboxState(id, state);
  let pods = await listAppPods(kubeconfig, id);
  let selected = state === "running" ? pickReadyPod(pods) : undefined;
  if (selected) {
    return { kubeconfig, pod: selected.name, container: selected.container };
  }

  if (state !== "stopped" && state !== "starting" && state !== "error") {
    throw new SealosApiError("沙箱未在运行，无法执行命令", 409);
  }

  if (state === "stopped" || state === "error") {
    await client.startApp(id);
    lastWritten = "starting";
    await setSandboxState(id, "starting");
  }

  const deadline = Date.now() + AUTO_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(AUTO_START_POLL_MS, signal);
    app = await client.getApp(id);
    state = mapLaunchpadStatus(app.status);
    if (state !== lastWritten) {
      lastWritten = state;
      await setSandboxState(id, state);
    }
    pods = await listAppPods(kubeconfig, id);
    selected = pickReadyPod(pods);
    if (selected && (state === "running" || state === "starting")) {
      return { kubeconfig, pod: selected.name, container: selected.container };
    }
  }

  throw new SealosApiError("沙箱开机超时，无法执行命令", 504);
}
