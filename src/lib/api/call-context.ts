import { bindAuthRequest } from "@/lib/auth/resolve";

/** MCP 请求用此头指定操作的沙箱。 */
export const SANDBOX_ID_HEADER = "x-sandbox-id";

export function sandboxIdFromRequest(req: Request): string | null {
  const value = req.headers.get(SANDBOX_ID_HEADER)?.trim();
  return value ? value : null;
}

/**
 * 包裹一次沙箱相关 REST 请求。
 * 调用日志仅由 MCP 工具写入，REST 不记入。
 */
export async function runSandboxApiCall<T>(opts: {
  req: Request;
  tool: string;
  method: string;
  path: string;
  arguments: Record<string, unknown>;
  run: () => Promise<{ status: number; result: unknown; value: T }>;
}): Promise<T> {
  bindAuthRequest(opts.req);
  const outcome = await opts.run();
  return outcome.value;
}
