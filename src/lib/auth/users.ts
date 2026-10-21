import { randomBytes } from "crypto";
import { query } from "@/lib/db/postgres";

export type PublicUser = {
  username: string;
  /** 展示名称；为空时回退为 username */
  displayName: string;
};

/** 与现有登录一致：token 为 32 字节十六进制，30 天后过期。 */
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isUserToken(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

type UserRow = { account: string; displayName: string | null };

function toPublicUser(row: UserRow | undefined): PublicUser | null {
  if (!row?.account) return null;
  const displayName = row.displayName?.trim();
  return {
    username: row.account,
    displayName: displayName || row.account,
  };
}

/** 登录名是 public.users.account。停用账号不能登录。 */
export async function authenticateUser(
  username: string,
  password: string,
): Promise<PublicUser | null> {
  const result = await query<UserRow>(
    `SELECT account, "displayName"
     FROM public.users
     WHERE account = $1 AND password = $2 AND status = 'ACTIVE'`,
    [username, password],
  );
  return toPublicUser(result.rows[0]);
}

export async function findUser(username: string): Promise<PublicUser | null> {
  const result = await query<UserRow>(
    `SELECT account, "displayName" FROM public.users WHERE account = $1`,
    [username],
  );
  return toPublicUser(result.rows[0]);
}

/** 未过期则复用 public.users.token，否则签发一枚新的。 */
export async function issueUserToken(username: string): Promise<string> {
  const existing = await query<{ token: string }>(
    `SELECT token
     FROM public.users
     WHERE account = $1
       AND status = 'ACTIVE'
       AND token IS NOT NULL
       AND "tokenExpiredAt" > now()`,
    [username],
  );
  const current = existing.rows[0]?.token;
  if (current && isUserToken(current)) return current;

  const token = randomBytes(32).toString("hex");
  const expiredAt = new Date(Date.now() + TOKEN_TTL_MS);
  const result = await query(
    `UPDATE public.users
     SET token = $2, "tokenExpiredAt" = $3, "updatedAt" = now()
     WHERE account = $1 AND status = 'ACTIVE'`,
    [username, token, expiredAt],
  );
  if ((result.rowCount ?? 0) === 0) {
    throw new Error("无法写入登录 token");
  }
  return token;
}

export async function findUserByToken(token: string): Promise<PublicUser | null> {
  if (!isUserToken(token)) return null;
  const result = await query<UserRow>(
    `SELECT account, "displayName"
     FROM public.users
     WHERE token = $1
       AND status = 'ACTIVE'
       AND "tokenExpiredAt" > now()`,
    [token],
  );
  return toPublicUser(result.rows[0]);
}

export async function clearUserToken(token: string): Promise<void> {
  if (!isUserToken(token)) return;
  await query(
    `UPDATE public.users
     SET token = NULL, "tokenExpiredAt" = NULL, "updatedAt" = now()
     WHERE token = $1`,
    [token],
  );
}
