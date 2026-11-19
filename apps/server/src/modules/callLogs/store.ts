import type { Prisma } from "@sealos-sandbox-manage/prisma";
import { db as prisma } from "../../infrastructure/database";
import { getMinioClient, minioBucket } from "../../infrastructure/minio";
import { type CallLogView } from "./audit";

type LogRow = {
  id: string;
  username: string | null;
  operation: string;
  method: string;
  path: string;
  arguments: Prisma.JsonValue;
  status: number;
  ok: boolean;
  resultKey: string | null;
  resultError: string | null;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  createdAt: Date;
};

function toView(row: LogRow): CallLogView {
  return {
    id: row.id,
    username: row.username ?? undefined,
    operation: row.operation,
    method: row.method,
    path: row.path,
    arguments: (row.arguments ?? {}) as Record<string, unknown>,
    status: row.status,
    ok: row.ok,
    resultKey: row.resultKey,
    resultError: row.resultError,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt.toISOString(),
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}

export type ListCallLogsOpts = {
  /** 页码，从 1 开始 */
  page?: number;
  /** 每页条数 */
  pageSize?: number;
  /** 兼容旧参数：未传 pageSize 时当作每页条数，且只返回第一页 */
  limit?: number;
  operation?: string;
  /** 开始时间下限（含） */
  from?: Date;
  /** 开始时间上限（含） */
  to?: Date;
};

function logWhere(
  username: string,
  opts?: ListCallLogsOpts,
): Prisma.CallLogWhereInput {
  const where: Prisma.CallLogWhereInput = {
    OR: [{ username }, { username: null }],
  };
  if (opts?.operation) {
    where.operation = opts.operation;
  }
  if (opts?.from || opts?.to) {
    where.startedAt = {
      ...(opts.from ? { gte: opts.from } : {}),
      ...(opts.to ? { lte: opts.to } : {}),
    };
  }
  return where;
}

export async function listCallLogs(
  username: string,
  opts?: ListCallLogsOpts,
): Promise<{ list: CallLogView[]; total: number }> {
  const pageSize = Math.min(
    Math.max(opts?.pageSize ?? opts?.limit ?? 20, 1),
    100,
  );
  const page = Math.max(Math.floor(opts?.page ?? 1), 1);
  const where = logWhere(username, opts);
  const [total, listed] = await Promise.all([
    prisma.callLog.count({ where }),
    prisma.callLog.findMany({
      where,
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
  ]);
  return {
    list: listed.map((row) => toView(row)),
    total,
  };
}

export async function getCallLog(
  username: string,
  id: string,
): Promise<CallLogView | null> {
  const row = await prisma.callLog.findFirst({
    where: {
      id,
      OR: [{ username }, { username: null }],
    },
  });
  return row ? toView(row) : null;
}

export async function readCallLogResult(resultKey: string): Promise<unknown> {
  const client = getMinioClient();
  const bucket = minioBucket();
  if (!client || !bucket) {
    throw new Error("未配置 MinIO");
  }
  const stream = await client.getObject(bucket, resultKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text) as unknown;
}