import {
  authenticateUser,
  clearUserToken,
  issueUserToken,
  type PublicUser,
} from '../../lib/auth/users';
import { AuthError } from '../../lib/sealos/errors';

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

export async function logoutWithToken(token: string | null): Promise<void> {
  if (!token) return;
  await clearUserToken(token);
}