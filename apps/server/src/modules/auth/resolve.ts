import { AsyncLocalStorage } from "node:async_hooks";
import { findUserByToken, type PublicUser } from "./users";
import { AuthError } from "../sealos/errors";
import {
  getDefaultRegion,
  resolveRegionForSandbox,
  type RegionCredentials,
} from "../sealos/regions";

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

export type RequestUser = PublicUser;

/**
 * 要求已登录的平台用户：`Authorization: Bearer <users.token>`。
 * 令牌、账单、调用日志走这条路径。
 */
export async function requireSessionUser(req?: Request): Promise<PublicUser> {
  const secret = tokenFrom(req);
  if (!secret) throw new AuthError("请先登录");
  const session = await findUserByToken(secret);
  if (!session) throw new AuthError("请先登录");
  return session;
}

/** 要求系统管理员（sandbox.users.role = ADMIN）。 */
export async function requireAdmin(req?: Request): Promise<PublicUser> {
  const session = await requireSessionUser(req);
  if (session.role !== "ADMIN") {
    throw new AuthError("需要系统管理员权限", 403);
  }
  return session;
}

/**
 * 沙箱 / 模板等接口：`Authorization: Bearer` 为登录 token。
 */
export async function requireUser(req?: Request): Promise<RequestUser> {
  const user = await optionalUser(req);
  if (user) return user;
  throw new AuthError("请先登录");
}

/** 与 requireUser 相同解析规则，未登录时返回 null。 */
export async function optionalUser(req?: Request): Promise<RequestUser | null> {
  const secret = tokenFrom(req);
  if (!secret) return null;

  const session = await findUserByToken(secret);
  if (session) return session;

  return null;
}