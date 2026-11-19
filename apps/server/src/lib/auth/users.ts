import { randomBytes } from "crypto";
import type { UserRole } from "@boat/prisma";
import { verifyPassword } from "./password";
import { prisma } from "../db/prisma";

export type { UserRole };

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
  role: UserRole;
};

function toPublicUser(row: UserRow | null): PublicUser | null {
  if (!row?.account) return null;
  const displayName = row.displayName?.trim();
  return {
    username: row.account,
    displayName: displayName || row.account,
    role: row.role === "ADMIN" ? "ADMIN" : "USER",
  };
}

const publicSelect = {
  account: true,
  displayName: true,
  role: true,
} as const;

/** 登录名是 sandbox.users.account。停用账号不能登录。密码为 scrypt$salt$hash。 */
export async function authenticateUser(
  username: string,
  password: string,
): Promise<PublicUser | null> {
  const row = await prisma.user.findFirst({
    where: { account: username, status: "ACTIVE" },
    select: { ...publicSelect, password: true },
  });
  if (!row) return null;
  const ok = await verifyPassword(password, row.password);
  if (!ok) return null;
  return toPublicUser(row);
}

export async function findUser(username: string): Promise<PublicUser | null> {
  const row = await prisma.user.findUnique({
    where: { account: username },
    select: publicSelect,
  });
  return toPublicUser(row);
}

/** 未过期则复用 sandbox.users.token，否则签发一枚新的。 */
export async function issueUserToken(username: string): Promise<string> {
  const existing = await prisma.user.findFirst({
    where: {
      account: username,
      status: "ACTIVE",
      token: { not: null },
      tokenExpiredAt: { gt: new Date() },
    },
    select: { token: true },
  });
  const current = existing?.token;
  if (current && isUserToken(current)) return current;

  const token = randomBytes(32).toString("hex");
  const expiredAt = new Date(Date.now() + TOKEN_TTL_MS);
  const updated = await prisma.user.updateMany({
    where: { account: username, status: "ACTIVE" },
    data: { token, tokenExpiredAt: expiredAt },
  });
  if (updated.count === 0) {
    throw new Error("无法写入登录 token");
  }
  return token;
}

export async function findUserByToken(token: string): Promise<PublicUser | null> {
  if (!isUserToken(token)) return null;
  const row = await prisma.user.findFirst({
    where: {
      token,
      status: "ACTIVE",
      tokenExpiredAt: { gt: new Date() },
    },
    select: publicSelect,
  });
  return toPublicUser(row);
}

export async function clearUserToken(token: string): Promise<void> {
  if (!isUserToken(token)) return;
  await prisma.user.updateMany({
    where: { token },
    data: { token: null, tokenExpiredAt: null },
  });
}
