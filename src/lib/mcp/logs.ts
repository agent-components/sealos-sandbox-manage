import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getMinioClient, minioBucket } from "@/lib/minio/client";
import {
  LOGGED_TOOLS,
  type McpCallLog,
  type McpCallLogView,
} from "@/lib/mcp/audit";

type LogRow = {
  id: string;
  username: string | null;
  apiKeyId: string | null;
  apiKeyName: string | null;
  channel: string;
  tool: string;
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

function toView(row: LogRow): McpCallLogView {
  return {
    id: row.id,
    username: row.username ?? undefined,
    apiKeyId: row.apiKeyId,
    apiKeyName: row.apiKeyName,
    channel: (row.channel as McpCallLog["channel"]) ?? "mcp",
    tool: row.tool,
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

export type ListMcpLogsOpts = {
  /** 页码，从 1 开始 */
  page?: number;
  /** 每页条数 */
  pageSize?: number;
  /** 兼容旧参数：未传 pageSize 时当作每页条数，且只返回第一页 */
  limit?: number;
  tool?: string;
  /** 指定 API Key；`session` 表示仅会话登录 */
  apiKeyId?: string;
  /** 开始时间下限（含） */
  from?: Date;
  /** 开始时间上限（含） */
  to?: Date;
};

function logWhere(username: string, opts?: ListMcpLogsOpts): Prisma.McpLogWhereInput {
  const where: Prisma.McpLogWhereInput = {
    OR: [{ username }, { username: null }],
    tool: opts?.tool ? opts.tool : { in: [...LOGGED_TOOLS] },
  };
  if (opts?.apiKeyId === "session") {
    where.apiKeyId = null;
  } else if (opts?.apiKeyId) {
    where.apiKeyId = opts.apiKeyId;
  }
  if (opts?.from || opts?.to) {
    where.startedAt = {
      ...(opts.from ? { gte: opts.from } : {}),
      ...(opts.to ? { lte: opts.to } : {}),
    };
  }
  return where;
}

export async function listMcpLogs(
  username: string,
  opts?: ListMcpLogsOpts,
): Promise<{ list: McpCallLogView[]; total: number }> {
  const pageSize = Math.min(
    Math.max(opts?.pageSize ?? opts?.limit ?? 20, 1),
    100,
  );
  const page = Math.max(Math.floor(opts?.page ?? 1), 1);
  const where = logWhere(username, opts);
  const [total, listed] = await Promise.all([
    prisma.mcpLog.count({ where }),
    prisma.mcpLog.findMany({
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

export async function getMcpLog(
  username: string,
  id: string,
): Promise<McpCallLogView | null> {
  const row = await prisma.mcpLog.findFirst({
    where: {
      id,
      tool: { in: [...LOGGED_TOOLS] },
      OR: [{ username }, { username: null }],
    },
  });
  return row ? toView(row) : null;
}

export async function readMcpLogResult(resultKey: string): Promise<unknown> {
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
