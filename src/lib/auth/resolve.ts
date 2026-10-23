import { readFileSync, existsSync } from "fs";
import { headers } from "next/headers";
import { authenticateApiKey } from "@/lib/apikey/store";
import { findUserByToken } from "@/lib/auth/users";
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

export type RequestUser = {
  username: string;
  /** 本次请求由 API Key 发起时存在。此时只能访问 sandboxIds 中的沙箱。 */
  apiKeyId?: string;
  /** API Key 显示名称（不含密钥明文） */
  apiKeyName?: string;
  sandboxIds?: string[];
  /** API Key 的 MCP 工具白名单；null / 缺省 = 不限制。会话用户无此字段。 */
  allowedTools?: string[] | null;
};

/** 要求已登录的平台用户（会话 cookie）。API Key 管理只走这条路径。 */
export async function requireSessionUser() {
  const session = await readUserSession();
  if (!session) {
    throw new AuthError("请先登录");
  }
  return session;
}

/**
 * 沙箱 / 模板等接口：会话 cookie，或 `Authorization: Bearer sandbox_...`。
 * 会话可访问该用户的全部沙箱；API Key 只能访问其授权列表。
 */
export async function requireUser(): Promise<RequestUser> {
  const user = await optionalUser();
  if (user) return user;
  throw new AuthError("请先登录");
}

/** 与 requireUser 相同解析规则，未登录时返回 null（供 MCP tools/list 等可选鉴权）。 */
export async function optionalUser(): Promise<RequestUser | null> {
  const session = await readUserSession();
  if (session) return session;

  const headerList = await headers();
  const secret = bearerToken(headerList.get("authorization"));
  if (secret) {
    const user = await authenticateApiKey(secret);
    if (user) return user;
    const sessionUser = await findUserByToken(secret);
    if (sessionUser) return sessionUser;
  }

  return null;
}
