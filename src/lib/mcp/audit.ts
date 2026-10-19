import { randomBytes } from "crypto";

import { query } from "@/lib/db/postgres";
import { getMinioClient, minioBucket } from "@/lib/minio/client";

/** 只有执行沙箱命令会写入调用日志。 */
export const AUDITED_TOOL = "runSandboxCommand";

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

/**
 * 记录一次 runSandboxCommand。元数据写入 PostgreSQL，命令结果写入 MinIO。
 * 其他工具直接返回。存储失败不影响本次调用。
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
  if (input.tool !== AUDITED_TOOL) return;

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

  try {
    await putResult(key, input.result);
    resultKey = key;
  } catch (error) {
    resultError = error instanceof Error ? error.message : "结果写入对象存储失败";
    console.error("MCP 结果写入 MinIO 失败", error);
  }

  try {
    await query(
      `INSERT INTO sandbox.mcp_logs (
         id, username, api_key_id, api_key_name, channel, tool, method, path,
         arguments, status, ok, result_key, result_error,
         started_at, completed_at, duration_ms, created_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9::jsonb, $10, $11, $12, $13,
         $14, $15, $16, $17
       )`,
      [
        id,
        username ?? null,
        apiKeyId ?? null,
        apiKeyName ?? null,
        input.channel ?? "mcp",
        input.tool,
        input.method,
        concretePath(input.path, input.arguments),
        JSON.stringify(input.arguments),
        input.status,
        input.status >= 200 && input.status < 400,
        resultKey,
        resultError,
        startedAt,
        completedAt,
        durationMs,
        completedAt,
      ],
    );
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
