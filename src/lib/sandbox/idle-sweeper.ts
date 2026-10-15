import cron, { type ScheduledTask } from "node-cron";

import { resolveKubeconfig } from "@/lib/auth/resolve";
import { listIdleShutdownCandidates } from "@/lib/sandbox/idle";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";
import { mapLaunchpadStatus } from "@/lib/sealos/map";

declare global {
  // eslint-disable-next-line no-var
  var __boatIdleCron: ScheduledTask | undefined;
  // eslint-disable-next-line no-var
  var __boatIdleSweeping: boolean | undefined;
}

/** 每分钟扫描一次：找出 MCP 空闲超时的运行中沙箱并关机。 */
export function startIdleSweeper() {
  if (global.__boatIdleCron) return;
  if (!cron.validate("* * * * *")) {
    throw new Error("无效的空闲关机 cron 表达式");
  }
  global.__boatIdleCron = cron.schedule("* * * * *", () => {
    void sweepIdleSandboxes();
  });
}

async function sweepIdleSandboxes() {
  if (global.__boatIdleSweeping) return;
  global.__boatIdleSweeping = true;
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
          `MCP 空闲关机：${candidate.sandboxId}（等待 ${candidate.idleMinutes} 分钟）`,
        );
      } catch (error) {
        console.error(`MCP 空闲关机失败：${candidate.sandboxId}`, error);
      }
    }
  } catch (error) {
    console.error("MCP 空闲扫描失败", error);
  } finally {
    global.__boatIdleSweeping = false;
  }
}
