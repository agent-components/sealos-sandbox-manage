import { readFileSync, existsSync } from "fs";
import { headers } from "next/headers";
import { authenticateApiKey } from "@/lib/apikey/store";
import { AuthError } from "@/lib/sealos/errors";
import { getSealosConfig } from "@/lib/sealos/config";
import { readUserSession } from "@/lib/auth/session";

/** 从 SEALOS_KUBECONFIG_PATH 读取服务端 kubeconfig。 */
export async function resolveKubeconfig(): Promise<string> {
  const { kubeconfigPath } = getSealosConfig();
  if (!existsSync(kubeconfigPath)) {
    throw new AuthError(`未找到 SEALOS_KUBECONFIG_PATH：${kubeconfigPath}`);
  }
  return readFileSync(kubeconfigPath, "utf8");
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/** 要求已登录的平台用户（会话 cookie）。API Key 管理只走这条路径。 */
export async function requireSessionUser(): Promise<{ username: string }> {
  const session = await readUserSession();
  if (!session) {
    throw new AuthError("请先登录");
  }
  return session;
}

/**
 * 沙箱 / 模板等接口：会话 cookie，或 `Authorization: Bearer boat_...`。
 * 密钥按所属用户隔离。
 */
export async function requireUser(): Promise<{ username: string }> {
  const session = await readUserSession();
  if (session) return session;

  const headerList = await headers();
  const secret = bearerToken(headerList.get("authorization"));
  if (secret) {
    const user = await authenticateApiKey(secret);
    if (user) return user;
  }

  throw new AuthError("请先登录");
}
