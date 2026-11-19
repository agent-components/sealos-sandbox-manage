import {
  authenticateUser,
  clearUserToken,
  issueUserToken,
  type PublicUser,
} from '../auth/users';
import { AuthError } from '../sealos/errors';
import {
  loginWithHarnessSso as exchangeHarnessSso,
  toPublicUser,
} from './harness-sso';

export async function loginWithPassword(
  username: string,
  password: string,
): Promise<{ user: PublicUser; token: string }> {
  const user = await authenticateUser(username.trim(), password);
  if (!user) {
    throw new AuthError('用户名或密码错误');
  }
  const token = await issueUserToken(user.username);
  return { user, token };
}

/** 嵌入页 tRPC：内部仍用 PublicUser（username）。 */
export async function loginWithHarnessSso(
  code: string,
): Promise<{ user: PublicUser; token: string }> {
  const result = await exchangeHarnessSso(code);
  return { token: result.token, user: toPublicUser(result.user) };
}

export async function logoutWithToken(token: string | null): Promise<void> {
  if (!token) return;
  await clearUserToken(token);
}