import { prisma } from "@/lib/db/prisma";

const SETTINGS_ID = "default";

export type SystemSettings = {
  /** 调用日志保留天数。null 表示不自动清理。 */
  logRetentionDays: number | null;
  updatedAt: string | null;
};

export async function getSystemSettings(): Promise<SystemSettings> {
  const row = await prisma.systemSetting.findUnique({
    where: { id: SETTINGS_ID },
  });
  const days = row?.logRetentionDays;
  return {
    logRetentionDays: typeof days === "number" && days >= 1 ? days : null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

export async function setLogRetentionDays(
  days: number | null,
): Promise<SystemSettings> {
  const logRetentionDays = days != null && days >= 1 ? Math.floor(days) : null;
  const row = await prisma.systemSetting.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, logRetentionDays },
    update: { logRetentionDays },
  });
  return {
    logRetentionDays: row.logRetentionDays,
    updatedAt: row.updatedAt.toISOString(),
  };
}
