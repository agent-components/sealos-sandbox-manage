import { query } from "@/lib/db/postgres";
import { getMinioClient, minioBucket } from "@/lib/minio/client";
import { AUDITED_TOOL, type McpCallLog, type McpCallLogView } from "@/lib/mcp/audit";

type LogRow = {
  id: string;
  username: string | null;
  api_key_id: string | null;
  api_key_name: string | null;
  channel: McpCallLog["channel"];
  tool: string;
  method: string;
  path: string;
  arguments: Record<string, unknown>;
  status: number;
  ok: boolean;
  result_key: string | null;
  result_error: string | null;
  started_at: Date;
  completed_at: Date;
  duration_ms: number;
  created_at: Date;
};

function toView(row: LogRow): McpCallLogView {
  return {
    id: row.id,
    username: row.username ?? undefined,
    apiKeyId: row.api_key_id,
    apiKeyName: row.api_key_name,
    channel: row.channel ?? "mcp",
    tool: row.tool,
    method: row.method,
    path: row.path,
    arguments: row.arguments,
    status: row.status,
    ok: row.ok,
    resultKey: row.result_key,
    resultError: row.result_error,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at.toISOString(),
    durationMs: row.duration_ms,
    createdAt: row.created_at.toISOString(),
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

function logFilter(username: string, opts?: ListMcpLogsOpts) {
  const where = ["(username = $1 OR username IS NULL)", "tool = $2"];
  const params: unknown[] = [username, AUDITED_TOOL];
  if (opts?.apiKeyId === "session") {
    where.push("api_key_id IS NULL");
  } else if (opts?.apiKeyId) {
    params.push(opts.apiKeyId);
    where.push(`api_key_id = $${params.length}`);
  }
  if (opts?.from) {
    params.push(opts.from);
    where.push(`started_at >= $${params.length}`);
  }
  if (opts?.to) {
    params.push(opts.to);
    where.push(`started_at <= $${params.length}`);
  }
  return { where: where.join(" AND "), params };
}

export async function listMcpLogs(
  username: string,
  opts?: ListMcpLogsOpts,
): Promise<{ list: McpCallLogView[]; total: number }> {
  if (opts?.tool && opts.tool !== AUDITED_TOOL) {
    return { list: [], total: 0 };
  }

  const pageSize = Math.min(
    Math.max(opts?.pageSize ?? opts?.limit ?? 20, 1),
    100,
  );
  const page = Math.max(Math.floor(opts?.page ?? 1), 1);
  const filter = logFilter(username, opts);
  const count = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM sandbox.mcp_logs WHERE ${filter.where}`,
    filter.params,
  );
  const listed = await query<LogRow>(
    `SELECT id, username, api_key_id, api_key_name, channel, tool, method, path,
            arguments, status, ok, result_key, result_error,
            started_at, completed_at, duration_ms, created_at
     FROM sandbox.mcp_logs
     WHERE ${filter.where}
     ORDER BY started_at DESC, created_at DESC
     LIMIT $${filter.params.length + 1}
     OFFSET $${filter.params.length + 2}`,
    [...filter.params, pageSize, (page - 1) * pageSize],
  );
  return {
    list: listed.rows.map(toView),
    total: Number(count.rows[0]?.count ?? 0),
  };
}

export async function getMcpLog(
  username: string,
  id: string,
): Promise<McpCallLogView | null> {
  const result = await query<LogRow>(
    `SELECT id, username, api_key_id, api_key_name, channel, tool, method, path,
            arguments, status, ok, result_key, result_error,
            started_at, completed_at, duration_ms, created_at
     FROM sandbox.mcp_logs
     WHERE id = $1 AND tool = $2 AND (username = $3 OR username IS NULL)`,
    [id, AUDITED_TOOL, username],
  );
  const row = result.rows[0];
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
