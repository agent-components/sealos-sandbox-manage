import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";

export type UserRole = "ADMIN" | "USER";

export type PublicUser = {
  username: string;
  /** 展示名称；为空时回退为 username */
  displayName: string;
  role: UserRole;
};

/** 与现有登录一致：token 为 32 字节十六进制，30 天后过期。 */
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isUserToken(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

type UserRow = {
  account: string;
  displayName: string | null;
  role: string | null;
};

function asRole(value: string | null | undefined): UserRole {
  return value === "ADMIN" ? "ADMIN" : "USER";
}

function toPublicUser(row: UserRow | undefined): PublicUser | null {
  if (!row?.account) return null;
  const displayName = row.displayName?.trim();
  return {
    username: row.account,
    displayName: displayName || row.account,
    role: asRole(row.role),
  };
}

/** 登录名是 public.users.account。停用账号不能登录。 */
export async function authenticateUser(
  username: string,
  password: string,
): Promise<PublicUser | null> {
  const rows = await prisma.$queryRaw<UserRow[]>`
    SELECT account, "displayName", role::text AS role
    FROM public.users
    WHERE account = ${username} AND password = ${password} AND status = 'ACTIVE'`;
  return toPublicUser(rows[0]);
}

export async function findUser(username: string): Promise<PublicUser | null> {
  const rows = await prisma.$queryRaw<UserRow[]>`
    SELECT account, "displayName", role::text AS role
    FROM public.users WHERE account = ${username}`;
  return toPublicUser(rows[0]);
}

/** 未过期则复用 public.users.token，否则签发一枚新的。 */
export async function issueUserToken(username: string): Promise<string> {
  const existing = await prisma.$queryRaw<{ token: string }[]>`
    SELECT token
    FROM public.users
    WHERE account = ${username}
      AND status = 'ACTIVE'
      AND token IS NOT NULL
      AND "tokenExpiredAt" > now()`;
  const current = existing[0]?.token;
  if (current && isUserToken(current)) return current;

  const token = randomBytes(32).toString("hex");
  const expiredAt = new Date(Date.now() + TOKEN_TTL_MS);
  const updated = await prisma.$executeRaw`
    UPDATE public.users
    SET token = ${token}, "tokenExpiredAt" = ${expiredAt}, "updatedAt" = now()
    WHERE account = ${username} AND status = 'ACTIVE'`;
  if (updated === 0) {
    throw new Error("无法写入登录 token");
  }
  return token;
}

export async function findUserByToken(token: string): Promise<PublicUser | null> {
  if (!isUserToken(token)) return null;
  const rows = await prisma.$queryRaw<UserRow[]>`
    SELECT account, "displayName", role::text AS role
    FROM public.users
    WHERE token = ${token}
      AND status = 'ACTIVE'
      AND "tokenExpiredAt" > now()`;
  return toPublicUser(rows[0]);
}

export async function clearUserToken(token: string): Promise<void> {
  if (!isUserToken(token)) return;
  await prisma.$executeRaw`
    UPDATE public.users
    SET token = NULL, "tokenExpiredAt" = NULL, "updatedAt" = now()
    WHERE token = ${token}`;
}
