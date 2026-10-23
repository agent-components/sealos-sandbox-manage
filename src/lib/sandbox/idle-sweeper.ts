import cron, { type ScheduledTask } from "node-cron";

import { resolveKubeconfig } from "@/lib/auth/resolve";
import {
  reconcileSandboxUsage,
  reconcileUsageFromLaunchpad,
  snapshotFromApp,
} from "@/lib/billing/meter";
import { listIdleShutdownCandidates } from "@/lib/sandbox/idle";
import {
  listSandboxOwners,
  setSandboxState,
  syncSandboxStates,
} from "@/lib/sandbox/record";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";
import { mapLaunchpadStatus, type LaunchpadApp } from "@/lib/sealos/map";
import type { SandboxState } from "@/lib/sandbox/schema";

declare global {
  // eslint-disable-next-line no-var
  var _idleCron: ScheduledTask | undefined;
  // eslint-disable-next-line no-var
  var _idleSweeping: boolean | undefined;
}

/** 每分钟扫描一次：先从 Sealos 同步状态与用量，再对空闲超时的 running 沙箱关机。 */
export function startIdleSweeper() {
  if (global._idleCron) return;
  if (!cron.validate("* * * * *")) {
    throw new Error("无效的空闲关机 cron 表达式");
  }
  global._idleCron = cron.schedule("* * * * *", () => {
    void sweepIdleSandboxes();
  });
}

async function syncStatesAndUsageFromSealos(
  kubeconfig: string,
): Promise<LaunchpadApp[] | null> {
  const client = createLaunchpadClient({ kubeconfig });
  const apps = await client.listApps();
  const states = new Map<string, SandboxState>(
    apps.map((app) => [app.name, mapLaunchpadStatus(app.status)]),
  );
  await syncSandboxStates(states);
  const owners = await listSandboxOwners();
  await reconcileUsageFromLaunchpad(apps, owners);
  return apps;
}

async function sweepIdleSandboxes() {
  if (global._idleSweeping) return;
  global._idleSweeping = true;
  try {
    const kubeconfig = await resolveKubeconfig();
    try {
      await syncStatesAndUsageFromSealos(kubeconfig);
    } catch (error) {
      console.error("同步沙箱状态失败", error);
    }

    const candidates = await listIdleShutdownCandidates();
    if (candidates.length === 0) return;

    const client = createLaunchpadClient({ kubeconfig });
    const owners = await listSandboxOwners();

    for (const candidate of candidates) {
      try {
        await client.pauseApp(candidate.sandboxId);
        const app = await client.getApp(candidate.sandboxId);
        await setSandboxState(
          candidate.sandboxId,
          mapLaunchpadStatus(app.status),
        );
        const owner = owners.get(candidate.sandboxId);
        if (owner) {
          await reconcileSandboxUsage(snapshotFromApp(app, owner));
        }
        console.info(
          `空闲关机：${candidate.sandboxId}（等待 ${candidate.idleMinutes} 分钟）`,
        );
      } catch (error) {
        console.error(`空闲关机失败：${candidate.sandboxId}`, error);
        try {
          const app = await client.getApp(candidate.sandboxId);
          await setSandboxState(
            candidate.sandboxId,
            mapLaunchpadStatus(app.status),
          );
        } catch {
          // 纠偏失败时留到下一轮全量同步
        }
      }
    }
  } catch (error) {
    console.error("空闲扫描失败", error);
  } finally {
    global._idleSweeping = false;
  }
}
