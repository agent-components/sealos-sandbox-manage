import { TRPCClientError } from '@trpc/client';
import { useEffect, useState } from 'react';
import { setUnauthorizedHandler } from '../../api/errorLink';
import { trpc } from '../../api/trpc';
import { clearToken, readToken, writeToken, type Session } from './session';

function isUnauthorized(error: unknown) {
  return error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED';
}

function loginErrorMessage(error: unknown) {
  if (!(error instanceof TRPCClientError)) return '登录失败';
  const message = error.message.trim();
  if (!message.startsWith('[')) return message || '登录失败';

  try {
    const issues = JSON.parse(message) as { message?: string }[];
    return issues.find((issue) => issue.message)?.message || '登录失败';
  } catch {
    return message || '登录失败';
  }
}

export function useLogin() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(() => readToken() === null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken();
      setSession(null);
      setError('');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    const token = readToken();
    if (!token) return;

    let cancelled = false;
    trpc.auth.me
      .query(undefined, { context: { silent: true } })
      .then((user) => {
        if (!cancelled) setSession(user);
      })
      .catch((caught) => {
        if (isUnauthorized(caught)) {
          clearToken();
          if (!cancelled) setSession(null);
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function login(input: { username: string; password: string }) {
    setError('');
    setPending(true);

    try {
      const result = await trpc.auth.login.mutate(input, { context: { silent: true } });
      writeToken(result.token);
      setSession(result.user);
    } catch (caught) {
      setError(loginErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    try {
      await trpc.auth.logout.mutate(undefined, { context: { silent: true } });
    } catch {
      // 接口失败也清掉本地 token。
    }
    clearToken();
    setSession(null);
    setError('');
  }

  function updateSession(patch: Partial<Session>) {
    setSession((current) => (current ? { ...current, ...patch } : current));
  }

  return { session, error, pending, ready, login, logout, updateSession };
}