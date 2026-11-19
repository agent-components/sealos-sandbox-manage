import { randomBytes } from 'node:crypto';
import type { UserRole } from '@sealos-sandbox-manage/prisma';
import { getHarnessOrigin } from '../../infrastructure/env';
import { AuthError } from '../sealos/errors';
import { issueUserToken, type PublicUser } from './users';
import { db as prisma } from '../../infrastructure/database';

type HarnessSsoUser = {
  id: string;
  account: string;
  displayName: string;
  role: UserRole | string;
};

type ExchangeOk = {
  user: HarnessSsoUser;
  componentId: string;
};

function normalizeRole(role: string): UserRole {
  return role === 'ADMIN' ? 'ADMIN' : 'USER';
}

/** 向宿主兑换一次性票据；失败统一为无效票据。 */
async function exchangeWithHarness(code: string): Promise<ExchangeOk> {
  const origin = getHarnessOrigin();
  if (!origin) {
    throw new AuthError('请从 Harness Admin 打开', 400);
  }

  let response: Response;
  try {
    response = await fetch(`${origin}/api/sso/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AuthError('请从 Harness Admin 打开', 400);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AuthError('请从 Harness Admin 打开', 400);
  }

  if (!response.ok) {
    throw new AuthError('请从 Harness Admin 打开', 400);
  }

  const user = (body as ExchangeOk | null)?.user;
  if (!user?.account?.trim()) {
    throw new AuthError('请从 Harness Admin 打开', 400);
  }

  return body as ExchangeOk;
}

/** 按宿主账号同步本地用户并签发组件短期 token（不接受密码登录的占位密码）。 */
async function ensureLocalUser(ssoUser: HarnessSsoUser): Promise<PublicUser> {
  const account = ssoUser.account.trim();
  const displayName = ssoUser.displayName?.trim() || account;
  const role = normalizeRole(String(ssoUser.role));
  const placeholderPassword = `sso$disabled$${randomBytes(24).toString('hex')}`;

  const existing = await prisma.user.findUnique({
    where: { account },
    select: { account: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { account },
      data: {
        displayName,
        role,
        status: 'ACTIVE',
      },
    });
  } else {
    await prisma.user.create({
      data: {
        account,
        displayName,
        role,
        status: 'ACTIVE',
        password: placeholderPassword,
      },
    });
  }

  return {
    username: account,
    displayName,
    role,
  };
}

export async function loginWithHarnessSso(
  code: string,
): Promise<{ user: PublicUser; token: string }> {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new AuthError('请从 Harness Admin 打开', 400);
  }

  const { user: ssoUser } = await exchangeWithHarness(trimmed);
  const user = await ensureLocalUser(ssoUser);
  const token = await issueUserToken(user.username);
  return { user, token };
}
