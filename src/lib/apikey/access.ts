import type { RequestUser } from "@/lib/auth/resolve";
import { AuthError } from "@/lib/sealos/errors";

/** 会话不受限。API Key 只能访问授权列表里的沙箱。 */
export function assertSandboxAllowed(user: RequestUser, sandboxId: string) {
  if (!user.apiKeyId) return;
  if ((user.sandboxIds ?? []).includes(sandboxId)) return;
  throw new AuthError("该令牌无权访问此沙箱", 403);
}

export function filterAppsByApiKey<T extends { name: string }>(
  user: RequestUser,
  apps: T[],
): T[] {
  if (!user.apiKeyId) return apps;
  const allowed = new Set(user.sandboxIds ?? []);
  return apps.filter((app) => allowed.has(app.name));
}
