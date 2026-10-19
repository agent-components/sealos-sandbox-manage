import cron, { type ScheduledTask } from "node-cron";

import { resolveKubeconfig } from "@/lib/auth/resolve";
import { listIdleShutdownCandidates } from "@/lib/sandbox/idle";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";
import { mapLaunchpadStatus } from "@/lib/sealos/map";

declare global {
  // eslint-disable-next-line no-var
  var _idleCron: ScheduledTask | undefined;
  // eslint-disable-next-line no-var
  var _idleSweeping: boolean | undefined;
}

/** 每分钟扫描一次：找出空闲超时的运行中沙箱并关机。 */
export function startIdleSweeper() {
  if (global._idleCron) return;
  if (!cron.validate("* * * * *")) {
    throw new Error("无效的空闲关机 cron 表达式");
  }
  global._idleCron = cron.schedule("* * * * *", () => {
    void sweepIdleSandboxes();
  });
}

async function sweepIdleSandboxes() {
  if (global._idleSweeping) return;
  global._idleSweeping = true;
  try {
    const candidates = await listIdleShutdownCandidates();
    if (candidates.length === 0) return;

    const kubeconfig = await resolveKubeconfig();
    const client = createLaunchpadClient({ kubeconfig });

    for (const candidate of candidates) {
      try {
        const app = await client.getApp(candidate.sandboxId);
        if (mapLaunchpadStatus(app.status) !== "running") continue;
        await client.pauseApp(candidate.sandboxId);
        console.info(
          `空闲关机：${candidate.sandboxId}（等待 ${candidate.idleMinutes} 分钟）`,
        );
      } catch (error) {
        console.error(`空闲关机失败：${candidate.sandboxId}`, error);
      }
    }
  } catch (error) {
    console.error("空闲扫描失败", error);
  } finally {
    global._idleSweeping = false;
  }
}
