import { AuthError, SealosApiError } from "@/lib/sealos/errors";
import type { LaunchpadApp } from "@/lib/sealos/map";
import { findSandboxRecords, getSandboxRecord } from "@/lib/sandbox/record";

export type OwnedAppRef = {
  name: string;
  app: LaunchpadApp;
  templateId?: string;
};

export async function selectOwnedApps(
  apps: LaunchpadApp[],
  username: string,
): Promise<OwnedAppRef[]> {
  const records = await findSandboxRecords(apps.map((app) => app.name));
  const owned: OwnedAppRef[] = [];
  for (const app of apps) {
    const record = records.get(app.name);
    if (record?.owner === username) {
      owned.push({
        name: app.name,
        app,
        templateId: record.templateId || undefined,
      });
    }
  }
  return owned;
}

/** 返回模板 ID。没有数据库记录时视为沙箱不存在。 */
export async function assertOwnedBy(
  app: LaunchpadApp,
  username: string,
): Promise<string | undefined> {
  const record = await getSandboxRecord(app.name);
  if (!record) throw new SealosApiError("沙箱不存在", 404);
  if (record.owner !== username) {
    throw new AuthError("无权访问该沙箱", 403);
  }
  return record.templateId || undefined;
}
