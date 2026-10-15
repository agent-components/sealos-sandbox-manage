import { getCollection } from "@/lib/db/mongo";
import { getMinioClient, minioBucket } from "@/lib/minio/client";
import { AUDITED_TOOL, type McpCallLog, type McpCallLogView } from "@/lib/mcp/audit";

let indexesReady = false;

async function mcpLogCollection() {
  const col = await getCollection<McpCallLog>("mcp_logs");
  if (!indexesReady) {
    await col.createIndex({ id: 1 }, { unique: true });
    await col.createIndex({ startedAt: -1 });
    await col.createIndex({ completedAt: -1 });
    await col.createIndex({ createdAt: -1 });
    await col.createIndex({ tool: 1, startedAt: -1 });
    await col.createIndex({ username: 1, startedAt: -1 });
    await col.createIndex({ apiKeyId: 1, startedAt: -1 });
    indexesReady = true;
  }
  return col;
}

function asIso(value: Date | string | undefined | null, fallback?: Date | string) {
  const raw = value ?? fallback;
  if (!raw) return new Date(0).toISOString();
  if (raw instanceof Date) return raw.toISOString();
  return String(raw);
}

function toView(doc: McpCallLog): McpCallLogView {
  const completedAt = asIso(doc.completedAt, doc.createdAt);
  const startedAt = asIso(doc.startedAt, doc.completedAt ?? doc.createdAt);
  const durationMs =
    typeof doc.durationMs === "number"
      ? doc.durationMs
      : Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
  return {
    id: doc.id,
    username: doc.username,
    apiKeyId: doc.apiKeyId ?? null,
    apiKeyName: doc.apiKeyName ?? null,
    channel: doc.channel ?? "mcp",
    tool: doc.tool,
    method: doc.method,
    path: doc.path,
    arguments: doc.arguments,
    status: doc.status,
    ok: doc.ok,
    resultKey: doc.resultKey,
    resultError: doc.resultError,
    startedAt,
    completedAt,
    durationMs,
    createdAt: asIso(doc.createdAt, completedAt),
  };
}

function ownedOrLegacy(username: string) {
  return {
    $or: [{ username }, { username: { $exists: false } }],
  };
}

export type ListMcpLogsOpts = {
  limit?: number;
  tool?: string;
  /** 指定 API Key；`session` 表示仅会话登录 */
  apiKeyId?: string;
  /** 开始时间下限（含） */
  from?: Date;
  /** 开始时间上限（含） */
  to?: Date;
};

export async function listMcpLogs(
  username: string,
  opts?: ListMcpLogsOpts,
): Promise<McpCallLogView[]> {
  if (opts?.tool && opts.tool !== AUDITED_TOOL) return [];

  const col = await mcpLogCollection();
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);

  const clauses: Record<string, unknown>[] = [
    ownedOrLegacy(username),
    { tool: AUDITED_TOOL },
  ];

  if (opts?.apiKeyId === "session") {
    clauses.push({
      $or: [{ apiKeyId: null }, { apiKeyId: { $exists: false } }],
    });
  } else if (opts?.apiKeyId) {
    clauses.push({ apiKeyId: opts.apiKeyId });
  }

  if (opts?.from || opts?.to) {
    const range: Record<string, Date> = {};
    if (opts.from) range.$gte = opts.from;
    if (opts.to) range.$lte = opts.to;
    clauses.push({
      $or: [
        { startedAt: range },
        { startedAt: { $exists: false }, createdAt: range },
      ],
    });
  }

  const filter = clauses.length === 1 ? clauses[0]! : { $and: clauses };
  const docs = await col
    .find(filter)
    .sort({ startedAt: -1, createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toView);
}

export async function getMcpLog(
  username: string,
  id: string,
): Promise<McpCallLogView | null> {
  const col = await mcpLogCollection();
  const doc = await col.findOne({
    id,
    tool: AUDITED_TOOL,
    ...ownedOrLegacy(username),
  });
  return doc ? toView(doc) : null;
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
