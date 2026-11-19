import { randomBytes } from "crypto";

import type { Prisma } from "@sealos-sandbox-manage/prisma";
import { db as prisma } from "../../infrastructure/database";
import { getMinioClient, minioBucket } from "../../infrastructure/minio";

export type CallLogRecord = {
  id: string;
  username?: string;
  operation: string;
  method: string;
  path: string;
  arguments: Record<string, unknown>;
  status: number;
  ok: boolean;
  resultKey: string | null;
  resultError: string | null;
  /** 请求开始时间 */
  startedAt: Date;
  /** 请求完成时间（写入日志时） */
  completedAt: Date;
  /** 耗时毫秒 */
  durationMs: number;
  createdAt: Date;
};

export type CallLogView = Omit<
  CallLogRecord,
  "createdAt" | "startedAt" | "completedAt"
> & {
  startedAt: string;
  completedAt: string;
  createdAt: string;
};

/**
 * 记录一次 OpenAPI 调用。元数据写入 PostgreSQL，结果写入 MinIO。
 * 存储失败不影响本次调用。
 */
export async function recordCall(input: {
  operation: string;
  method: string;
  path: string;
  arguments: Record<string, unknown>;
  status: number;
  result: unknown;
  username?: string;
  /** 请求开始时刻；省略则与完成时间相同 */
  startedAt?: Date | number;
}): Promise<void> {
  let username = input.username;
  if (username === undefined) {
    try {
      const { requireUser } = await import("../auth/resolve");
      const user = await requireUser();
      username = user.username;
    } catch {
      // 鉴权上下文不可用时仍尽量落库
    }
  }

  const completedAt = new Date();
  const startedAt =
    input.startedAt instanceof Date
      ? input.startedAt
      : typeof input.startedAt === "number"
        ? new Date(input.startedAt)
        : completedAt;
  const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());

  const id = `call_${completedAt.getTime().toString(36)}_${randomBytes(4).toString("hex")}`;
  const key = objectKey(completedAt, id);
  let resultKey: string | null = null;
  let resultError: string | null = null;

  try {
    await putResult(key, input.result);
    resultKey = key;
  } catch (error) {
    resultError =
      error instanceof Error ? error.message : "结果写入对象存储失败";
    console.error("调用日志结果写入 MinIO 失败", error);
  }

  try {
    await prisma.callLog.create({
      data: {
        id,
        username: username ?? null,
        operation: input.operation,
        method: input.method,
        path: concretePath(input.path, input.arguments),
        arguments: sanitizeArgs(input.arguments) as Prisma.InputJsonValue,
        status: input.status,
        ok: input.status >= 200 && input.status < 400,
        resultKey,
        resultError,
        startedAt,
        completedAt,
        durationMs,
        createdAt: completedAt,
      },
    });
  } catch (error) {
    console.error("调用日志写入数据库失败", error);
  }
}

/** 避免把超大 contents 塞进 arguments 列。 */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const next = { ...args };
  if (typeof next.contents === "string" && next.contents.length > 4096) {
    next.contents = `[omitted ${next.contents.length} chars]`;
  }
  if (typeof next.old_string === "string" && next.old_string.length > 4096) {
    next.old_string = `[omitted ${next.old_string.length} chars]`;
  }
  if (typeof next.new_string === "string" && next.new_string.length > 4096) {
    next.new_string = `[omitted ${next.new_string.length} chars]`;
  }
  return next;
}

function concretePath(template: string, args: Record<string, unknown>) {
  const path = template.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const value = args[name];
    if (typeof value === "string" || typeof value === "number") {
      return encodeURIComponent(String(value));
    }
    return match;
  });
  if (!path) return "";
  return path.startsWith("/api/")
    ? path
    : `/api/v1${path.startsWith("/") ? path : `/${path}`}`;
}

function objectKey(now: Date, id: string) {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `call-results/${year}/${month}/${day}/${id}.json`;
}

async function putResult(key: string, result: unknown) {
  const client = getMinioClient();
  const bucket = minioBucket();
  if (!client || !bucket) {
    throw new Error("未配置 MinIO");
  }
  const body = Buffer.from(JSON.stringify(result ?? null));
  await client.putObject(bucket, key, body, body.length, {
    "Content-Type": "application/json",
  });
}