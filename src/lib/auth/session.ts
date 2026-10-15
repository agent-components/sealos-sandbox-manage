import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "boat_user_session";

type SessionPayload = {
  username: string;
  exp: number;
};

function sessionSecret(): string {
  const secret = process.env.BOAT_SESSION_SECRET;
  if (!secret) {
    throw new Error("缺少必要环境变量：BOAT_SESSION_SECRET");
  }
  return secret;
}

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function encrypt(payload: SessionPayload): string {
  const key = keyFromSecret(sessionSecret());
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decrypt(token: string): SessionPayload | null {
  try {
    const key = keyFromSecret(sessionSecret());
    const buf = Buffer.from(token, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }
}

export async function setUserSession(username: string) {
  const jar = await cookies();
  const token = encrypt({
    username,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearUserSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function readUserSession(): Promise<{ username: string } | null> {
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  if (!value) return null;
  const payload = decrypt(value);
  if (!payload?.username || payload.exp < Date.now()) return null;
  return { username: payload.username };
}
