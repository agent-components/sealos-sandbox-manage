import { randomBytes } from 'node:crypto';
import type { UserRole } from '@sealos-sandbox-manage/prisma';
import { getHarnessOrigin } from '../../infrastructure/env';
import { AuthError } from '../sealos/errors';
import { issueHarnessSessionToken, type PublicUser } from './users';
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

/** 组件会话用户：宿主 OpenAPI 协议约定字段。 */
export type HarnessSessionUser = {
  id: string;
  account: string;
  displayName: string;
  role: UserRole;
};

function normalizeRole(role: string): UserRole {
  return role === 'ADMIN' ? 'ADMIN' : 'USER';
}

export function toPublicUser(session: HarnessSessionUser): PublicUser {
  return {
    username: session.account,
    displayName: session.displayName,
    role: session.role,
  };
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

/** 按宿主账号同步本地用户（不接受密码登录的占位密码）。 */
async function ensureLocalUser(ssoUser: HarnessSsoUser): Promise<HarnessSessionUser> {
  const account = ssoUser.account.trim();
  const displayName = ssoUser.displayName?.trim() || account;
  const role = normalizeRole(String(ssoUser.role));
  const placeholderPassword = `sso$disabled$${randomBytes(24).toString('hex')}`;

  const existing = await prisma.user.findUnique({
    where: { account },
    select: { id: true },
  });

  if (existing) {
    const updated = await prisma.user.update({
      where: { account },
      data: {
        displayName,
        role,
        status: 'ACTIVE',
      },
      select: { id: true, account: true, displayName: true, role: true },
    });
    return {
      id: updated.id,
      account: updated.account,
      displayName: updated.displayName.trim() || updated.account,
      role: normalizeRole(updated.role),
    };
  }

  const created = await prisma.user.create({
    data: {
      account,
      displayName,
      role,
      status: 'ACTIVE',
      password: placeholderPassword,
    },
    select: { id: true, account: true, displayName: true, role: true },
  });

  return {
    id: created.id,
    account: created.account,
    displayName: created.displayName.trim() || created.account,
    role: normalizeRole(created.role),
  };
}

/**
 * 组件侧 SSO：用宿主签发的一次性 code 兑身份，再签发本组件约 8 小时会话。
 * 嵌入页（tRPC）与宿主主动调 OpenAPI（HTTP POST /api/auth/sso）共用。
 */
export async function loginWithHarnessSso(
  code: string,
): Promise<{ user: HarnessSessionUser; token: string }> {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new AuthError('请从 Harness Admin 打开', 400);
  }

  const { user: ssoUser } = await exchangeWithHarness(trimmed);
  const user = await ensureLocalUser(ssoUser);
  const token = await issueHarnessSessionToken(user.account);
  return { user, token };
}
