import { randomBytes } from "crypto";

import { getCollection } from "@/lib/db/mongo";
import { getMinioClient, minioBucket } from "@/lib/minio/client";

const FILE_TOOL = "getSandboxArtifact";

export type CallChannel = "mcp" | "rest";

export type McpCallLog = {
  id: string;
  username?: string;
  /** 发起请求的 API Key ID；会话登录时为空 */
  apiKeyId?: string | null;
  /** API Key 名称快照；会话登录时为空 */
  apiKeyName?: string | null;
  /** 调用来源：MCP 或 OpenAPI/REST */
  channel?: CallChannel;
  tool: string;
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

export type McpCallLogView = Omit<
  McpCallLog,
  "createdAt" | "startedAt" | "completedAt"
> & {
  startedAt: string;
  completedAt: string;
  createdAt: string;
};

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

/**
 * 记录一次沙箱 API / MCP 调用。元数据写入 Mongo，请求结果写入 MinIO。
 * 获取文件只记元数据，不落结果。存储失败不影响本次调用。
 */
export async function recordMcpCall(input: {
  tool: string;
  method: string;
  path: string;
  arguments: Record<string, unknown>;
  status: number;
  result: unknown;
  username?: string;
  apiKeyId?: string | null;
  apiKeyName?: string | null;
  channel?: CallChannel;
  /** 请求开始时刻；省略则与完成时间相同 */
  startedAt?: Date | number;
}): Promise<void> {
  let username = input.username;
  let apiKeyId = input.apiKeyId;
  let apiKeyName = input.apiKeyName;
  if (username === undefined || apiKeyId === undefined) {
    try {
      const { requireUser } = await import("@/lib/auth/resolve");
      const user = await requireUser();
      username = username ?? user.username;
      if (apiKeyId === undefined) {
        apiKeyId = user.apiKeyId ?? null;
        apiKeyName = user.apiKeyName ?? null;
      }
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

  const id = `mcp_${completedAt.getTime().toString(36)}_${randomBytes(4).toString("hex")}`;
  const key = objectKey(completedAt, id);
  let resultKey: string | null = null;
  let resultError: string | null = null;

  if (input.tool !== FILE_TOOL) {
    try {
      await putResult(key, input.result);
      resultKey = key;
    } catch (error) {
      resultError = error instanceof Error ? error.message : "结果写入对象存储失败";
      console.error("MCP 结果写入 MinIO 失败", error);
    }
  }

  try {
    const col = await mcpLogCollection();
    await col.insertOne({
      id,
      ...(username ? { username } : {}),
      apiKeyId: apiKeyId ?? null,
      apiKeyName: apiKeyName ?? null,
      channel: input.channel ?? "mcp",
      tool: input.tool,
      method: input.method,
      path: concretePath(input.path, input.arguments),
      arguments: input.arguments,
      status: input.status,
      ok: input.status >= 200 && input.status < 400,
      resultKey,
      resultError,
      startedAt,
      completedAt,
      durationMs,
      createdAt: completedAt,
    });
  } catch (error) {
    console.error("MCP 调用日志写入数据库失败", error);
  }
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
  return path.startsWith("/api/") ? path : `/api/v1${path.startsWith("/") ? path : `/${path}`}`;
}

function objectKey(now: Date, id: string) {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `mcp-results/${year}/${month}/${day}/${id}.json`;
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
