import { AsyncLocalStorage } from "node:async_hooks";
import { authenticateApiKey } from "@/lib/apikey/store";
import { findUserByToken, type PublicUser } from "@/lib/auth/users";
import { AuthError } from "@/lib/sealos/errors";
import {
  getDefaultRegion,
  resolveRegionForSandbox,
  type RegionCredentials,
} from "@/lib/sealos/regions";

const authRequest = new AsyncLocalStorage<Request>();

/** 让同一次请求里后续的鉴权调用能读到 Authorization，而不必层层传递 Request。 */
export function bindAuthRequest(req: Request) {
  authRequest.enterWith(req);
}

function requestOf(req?: Request): Request | null {
  if (req) {
    bindAuthRequest(req);
    return req;
  }
  return authRequest.getStore() ?? null;
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function tokenFrom(req?: Request): string | null {
  const current = requestOf(req);
  if (!current) return null;
  return bearerToken(current.headers.get("authorization"));
}

/** 默认区域的 kubeconfig（兼容旧调用）。优先 DB，空库回退 env。 */
export async function resolveKubeconfig(): Promise<string> {
  const region = await getDefaultRegion();
  return region.kubeconfig;
}

export async function resolveDefaultRegion(): Promise<RegionCredentials> {
  return getDefaultRegion();
}

export async function resolveSandboxRegion(
  sandboxId: string,
): Promise<RegionCredentials> {
  return resolveRegionForSandbox(sandboxId);
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

/**
 * 要求已登录的平台用户：`Authorization: Bearer <users.token>`。
 * 不接受 API Key。令牌、账单、调用日志走这条路径。
 */
export async function requireSessionUser(req?: Request): Promise<PublicUser> {
  const secret = tokenFrom(req);
  if (!secret) throw new AuthError("请先登录");
  const session = await findUserByToken(secret);
  if (!session) throw new AuthError("请先登录");
  return session;
}

/** 要求系统管理员（public.users.role = ADMIN）。不接受 API Key。 */
export async function requireAdmin(req?: Request): Promise<PublicUser> {
  const session = await requireSessionUser(req);
  if (session.role !== "ADMIN") {
    throw new AuthError("需要系统管理员权限", 403);
  }
  return session;
}

/**
 * 沙箱 / 模板等接口：`Authorization: Bearer` 可以是登录 token，或 `sandbox_...` API Key。
 * 登录 token 可访问该用户的全部沙箱；API Key 只能访问其授权列表。
 */
export async function requireUser(req?: Request): Promise<RequestUser> {
  const user = await optionalUser(req);
  if (user) return user;
  throw new AuthError("请先登录");
}

/** 与 requireUser 相同解析规则，未登录时返回 null（供 MCP tools/list 等可选鉴权）。 */
export async function optionalUser(req?: Request): Promise<RequestUser | null> {
  const secret = tokenFrom(req);
  if (!secret) return null;

  const apiKeyUser = await authenticateApiKey(secret);
  if (apiKeyUser) return apiKeyUser;

  const session = await findUserByToken(secret);
  if (session) return session;

  return null;
}
