import { cookies } from "next/headers";
import {
  clearUserToken,
  findUserByToken,
  issueUserToken,
} from "@/lib/auth/users";

export const SESSION_COOKIE = "sandbox_user_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export async function setUserSession(username: string) {
  const token = await issueUserToken(username);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearUserSession() {
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  if (value) await clearUserToken(value);
  jar.delete(SESSION_COOKIE);
}

export async function readUserSession(): Promise<{ username: string } | null> {
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  if (!value) return null;
  return findUserByToken(value);
}
