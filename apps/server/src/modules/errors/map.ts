import { TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import { AuthError, SealosApiError } from '../../lib/sealos/errors';
import { jsonError, type JsonResponse } from '../../lib/api/response';

function trpcCodeFromStatus(status: number): TRPCError['code'] {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 400) return 'BAD_REQUEST';
  if (status === 409) return 'CONFLICT';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 504) return 'TIMEOUT';
  if (status >= 500) return 'INTERNAL_SERVER_ERROR';
  return 'BAD_REQUEST';
}

export function toTrpcError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  if (error instanceof AuthError) {
    return new TRPCError({
      code: trpcCodeFromStatus(error.status),
      message: error.message,
    });
  }
  if (error instanceof SealosApiError) {
    return new TRPCError({
      code: trpcCodeFromStatus(error.status),
      message: error.message,
    });
  }
  if (error instanceof ZodError) {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: '参数校验失败',
      cause: error.flatten(),
    });
  }
  const message = error instanceof Error ? error.message : '服务器内部错误';
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
}

export function toJsonResponse(error: unknown): JsonResponse {
  return jsonError(error);
}