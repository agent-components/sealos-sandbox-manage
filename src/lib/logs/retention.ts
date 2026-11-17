import cron, { type ScheduledTask } from "node-cron";

import { prisma } from "@/lib/db/prisma";
import { getMinioClient, minioBucket } from "@/lib/minio/client";
import { getSystemSettings } from "@/lib/settings/store";

declare global {
  // eslint-disable-next-line no-var
  var _logCron: ScheduledTask | undefined;
  // eslint-disable-next-line no-var
  var _logSweeping: boolean | undefined;
}

const BATCH = 200;

/** 每天 03:15 扫描一次，删除超出保留天数的调用日志（全站生效）。 */
export function startLogRetention() {
  if (global._logCron) return;
  const expr = "15 3 * * *";
  if (!cron.validate(expr)) {
    throw new Error("无效的日志清理 cron 表达式");
  }
  global._logCron = cron.schedule(expr, () => {
    void purgeExpiredCallLogs();
  });
}

export async function purgeExpiredCallLogs() {
  if (global._logSweeping) return;
  global._logSweeping = true;
  try {
    const { logRetentionDays } = await getSystemSettings();
    if (logRetentionDays == null) return;

    const cutoff = new Date(Date.now() - logRetentionDays * 24 * 60 * 60 * 1000);
    let removed = 0;

    for (;;) {
      const rows = await prisma.mcpLog.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true, resultKey: true },
        take: BATCH,
      });
      if (rows.length === 0) break;

      await deleteResultObjects(
        rows.map((row) => row.resultKey).filter((key): key is string => Boolean(key)),
      );
      await prisma.mcpLog.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });
      removed += rows.length;
      if (rows.length < BATCH) break;
    }

    if (removed > 0) {
      console.info(
        `调用日志清理：删除 ${removed} 条（早于 ${cutoff.toISOString()}，保留 ${logRetentionDays} 天）`,
      );
    }
  } catch (error) {
    console.error("调用日志清理失败", error);
  } finally {
    global._logSweeping = false;
  }
}

async function deleteResultObjects(keys: string[]) {
  if (keys.length === 0) return;
  const client = getMinioClient();
  const bucket = minioBucket();
  if (!client || !bucket) return;
  await Promise.all(
    keys.map(async (key) => {
      try {
        await client.removeObject(bucket, key);
      } catch (error) {
        console.error(`删除日志结果对象失败：${key}`, error);
      }
    }),
  );
}
