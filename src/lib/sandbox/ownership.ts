import { AuthError, SealosApiError } from "@/lib/sealos/errors";
import type { LaunchpadApp } from "@/lib/sealos/map";
import { findSandboxRecords, getSandboxRecord } from "@/lib/sandbox/record";

/** 旧沙箱曾把归属写进容器环境变量。新沙箱不再注入，只认数据库记录。 */
const LEGACY_MARKER = "BOAT_SANDBOX";
const LEGACY_OWNER = "BOAT_USER";
const LEGACY_TEMPLATE = "BOAT_TEMPLATE";

function envValue(app: LaunchpadApp, name: string): string | undefined {
  return app.env?.find((entry) => entry.name === name)?.value || undefined;
}

function legacyOwner(app: LaunchpadApp): string | null {
  const marked = app.env?.some(
    (entry) => entry.name === LEGACY_MARKER && entry.value === "true",
  );
  if (!marked) return null;
  return envValue(app, LEGACY_OWNER) ?? null;
}

function legacyTemplate(app: LaunchpadApp): string | undefined {
  return envValue(app, LEGACY_TEMPLATE);
}

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
    if (record) {
      if (record.owner === username) {
        owned.push({
          name: app.name,
          app,
          templateId: record.templateId || undefined,
        });
      }
      continue;
    }
    if (legacyOwner(app) === username) {
      owned.push({ name: app.name, app, templateId: legacyTemplate(app) });
    }
  }
  return owned;
}

/** 返回模板 ID。没有数据库记录时，才回退到旧环境变量。 */
export async function assertOwnedBy(
  app: LaunchpadApp,
  username: string,
): Promise<string | undefined> {
  const record = await getSandboxRecord(app.name);
  if (record) {
    if (record.owner !== username) {
      throw new AuthError("无权访问该沙箱", 403);
    }
    return record.templateId || undefined;
  }
  const owner = legacyOwner(app);
  if (owner === username) return legacyTemplate(app);
  if (owner) throw new AuthError("无权访问该沙箱", 403);
  throw new SealosApiError("沙箱不存在", 404);
}
