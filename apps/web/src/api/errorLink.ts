import { notification } from 'antd';
import { TRPCClientError, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from 'server/router';

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

function isUnauthorized(error: unknown) {
  return error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED';
}

function readErrorMessage(error: unknown) {
  if (!(error instanceof TRPCClientError)) {
    return error instanceof Error && error.message ? error.message : '请求失败';
  }

  const message = error.message.trim();
  if (!message.startsWith('[')) return message || '请求失败';

  try {
    const issues = JSON.parse(message) as { message?: string }[];
    return issues.find((issue) => issue.message)?.message || '请求失败';
  } catch {
    return message || '请求失败';
  }
}

export function errorToastLink(): TRPCLink<AppRouter> {
  let lastToast = { text: '', at: 0 };

  return () => {
    return ({ op, next }) => {
      return observable((observer) => {
        return next(op).subscribe({
          next(value) {
            observer.next(value);
          },
          error(error) {
            if (isUnauthorized(error) && op.path !== 'auth.login') {
              unauthorizedHandler?.();
            }
            if (op.context.silent !== true) {
              const text = readErrorMessage(error);
              const now = Date.now();
              if (text !== lastToast.text || now - lastToast.at > 300) {
                lastToast = { text, at: now };
                notification.error({ title: text });
              }
            }
            observer.error(error);
          },
          complete() {
            observer.complete();
          },
        });
      });
    };
  };
}