import { AuthError, SealosApiError } from "../sealos/errors";
import type { LaunchpadApp } from "../sealos/map";
import { getSandboxRecord } from "./record";

/** 返回模板 ID。没有数据库记录时视为沙箱不存在。 */
export async function assertOwnedBy(
  app: LaunchpadApp,
  username: string
): Promise<string | undefined> {
  const record = await getSandboxRecord(app.name);
  if (!record) throw new SealosApiError("沙箱不存在", 404);
  if (record.owner !== username) {
    throw new AuthError("无权访问该沙箱", 403);
  }
  return record.templateId || undefined;
}
