import { jsonError } from "@/lib/api/response";
import { AUDITED_TOOL, recordMcpCall, type CallChannel } from "@/lib/mcp/audit";
import {
  beginMcpActivity,
  endMcpActivity,
  touchMcpActivity,
} from "@/lib/sandbox/idle";

export type { CallChannel };

export const SANDBOX_CHANNEL_HEADER = "x-sandbox-channel";

export function callChannel(req: Request): CallChannel {
  return req.headers.get(SANDBOX_CHANNEL_HEADER) === "mcp" ? "mcp" : "rest";
}

/** 包裹一次沙箱相关请求：可选空闲计时。只有 runSandboxCommand 写调用日志。 */
export async function runSandboxApiCall<T>(opts: {
  req: Request;
  tool: string;
  method: string;
  path: string;
  arguments: Record<string, unknown>;
  sandboxId?: string | null;
  /** 是否计入空闲活动；list 等传 false */
  trackActivity?: boolean;
  run: () => Promise<{ status: number; result: unknown; value: T }>;
}): Promise<T> {
  const startedAt = Date.now();
  const channel = callChannel(opts.req);
  const sandboxId = opts.sandboxId?.trim() || "";
  const track = !!opts.trackActivity && !!sandboxId;

  if (track) await beginMcpActivity(sandboxId);

  let touch = false;
  try {
    const outcome = await opts.run();
    touch = outcome.status !== 401 && outcome.status !== 403;
    if (opts.tool === AUDITED_TOOL) {
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
    }
    return outcome.value;
  } catch (error) {
    const failed = jsonError(error);
    let result: unknown = { error: "服务器内部错误" };
    try {
      result = await failed.clone().json();
    } catch {
      // ignore
    }
    if (opts.tool === AUDITED_TOOL) {
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
    }
    throw error;
  } finally {
    if (track) await endMcpActivity(sandboxId, { touch });
  }
}

export async function touchSandboxActivity(sandboxId: string) {
  await touchMcpActivity(sandboxId);
}
