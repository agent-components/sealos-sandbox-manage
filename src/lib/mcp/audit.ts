import { randomBytes } from "crypto";

import { prisma } from "@/lib/db/prisma";
import { getMinioClient, minioBucket } from "@/lib/minio/client";
import { MCP_TOOL_NAMES } from "@/lib/mcp/tools";
import { Prisma } from "@prisma/client";

/** 写入调用日志的工具名。 */
export const LOGGED_TOOLS = MCP_TOOL_NAMES;

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
 * 记录一次工具调用。元数据写入 PostgreSQL，结果写入 MinIO。
 * 存储失败不影响本次调用。
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
  if (!(LOGGED_TOOLS as readonly string[]).includes(input.tool)) return;

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

  const id = `mcp_${completedAt.getTime().toString(36)}_${randomBytes(
    4
  ).toString("hex")}`;
  const key = objectKey(completedAt, id);
  let resultKey: string | null = null;
  let resultError: string | null = null;

  try {
    await putResult(key, input.result);
    resultKey = key;
  } catch (error) {
    resultError =
      error instanceof Error ? error.message : "结果写入对象存储失败";
    console.error("MCP 结果写入 MinIO 失败", error);
  }

  try {
    await prisma.mcpLog.create({
      data: {
        id,
        username: username ?? null,
        apiKeyId: apiKeyId ?? null,
        apiKeyName: apiKeyName ?? null,
        channel: input.channel ?? "mcp",
        tool: input.tool,
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
    console.error("MCP 调用日志写入数据库失败", error);
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
