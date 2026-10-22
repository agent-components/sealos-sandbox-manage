import { jsonError } from "@/lib/api/response";
import { recordMcpCall, type CallChannel } from "@/lib/mcp/audit";

export type { CallChannel };

export const SANDBOX_CHANNEL_HEADER = "x-sandbox-channel";

/** MCP 请求用此头指定操作的沙箱。 */
export const SANDBOX_ID_HEADER = "x-sandbox-id";

export function callChannel(req: Request): CallChannel {
  return req.headers.get(SANDBOX_CHANNEL_HEADER) === "mcp" ? "mcp" : "rest";
}

export function sandboxIdFromRequest(req: Request): string | null {
  const value = req.headers.get(SANDBOX_ID_HEADER)?.trim();
  return value ? value : null;
}

/**
 * 包裹一次沙箱相关 REST 请求：写入调用日志。
 * 空闲活动（last_activity_at / inflight）仅由 MCP 工具调用维护，此处不触碰。
 */
export async function runSandboxApiCall<T>(opts: {
  req: Request;
  tool: string;
  method: string;
  path: string;
  arguments: Record<string, unknown>;
  run: () => Promise<{ status: number; result: unknown; value: T }>;
}): Promise<T> {
  const startedAt = Date.now();
  const channel = callChannel(opts.req);

  try {
    const outcome = await opts.run();
    await recordMcpCall({
      tool: opts.tool,
      method: opts.method,
      path: opts.path,
      arguments: opts.arguments,
      status: outcome.status,
      result: outcome.result,
      startedAt,
      channel,
    });
    return outcome.value;
  } catch (error) {
    const failed = jsonError(error);
    let result: unknown = { error: "服务器内部错误" };
    try {
      result = await failed.clone().json();
    } catch {
      // ignore
    }
    await recordMcpCall({
      tool: opts.tool,
      method: opts.method,
      path: opts.path,
      arguments: opts.arguments,
      status: failed.status,
      result,
      startedAt,
      channel,
    });
    throw error;
  }
}
