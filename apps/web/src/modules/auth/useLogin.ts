import { TRPCClientError } from '@trpc/client';
import { useEffect, useState } from 'react';
import { setUnauthorizedHandler } from '../../api/errorLink';
import { trpc } from '../../api/trpc';
import { getAppMode } from '../runtime/embed';
import { readHarnessSsoCode, stripHarnessSsoFromUrl } from '../runtime/harness-query';
import { clearToken, readToken, writeToken, type Session } from './session';

const EMBED_OPEN_HINT = '请从 Harness Admin 打开';

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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken();
      setSession(null);
      setError('');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const mode = getAppMode();

    async function boot() {
      if (mode === 'embedded') {
        const code = readHarnessSsoCode();
        if (!code) {
          clearToken();
          if (!cancelled) {
            setSession(null);
            setError(EMBED_OPEN_HINT);
            setReady(true);
          }
          return;
        }

        try {
          const result = await trpc.auth.harnessSso.mutate(
            { code },
            { context: { silent: true } },
          );
          if (cancelled) return;
          writeToken(result.token);
          setSession(result.user);
          setError('');
          stripHarnessSsoFromUrl();
        } catch {
          clearToken();
          if (!cancelled) {
            setSession(null);
            setError(EMBED_OPEN_HINT);
          }
        } finally {
          if (!cancelled) setReady(true);
        }
        return;
      }

      const token = readToken();
      if (!token) {
        if (!cancelled) setReady(true);
        return;
      }

      try {
        const user = await trpc.auth.me.query(undefined, { context: { silent: true } });
        if (!cancelled) setSession(user);
      } catch (caught) {
        if (isUnauthorized(caught)) {
          clearToken();
          if (!cancelled) setSession(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(input: { username: string; password: string }) {
    if (getAppMode() === 'embedded') {
      setError(EMBED_OPEN_HINT);
      return;
    }

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
