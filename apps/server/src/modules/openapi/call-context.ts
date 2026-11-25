import { bindAuthRequest } from "../auth/resolve";

/**
 * 包裹一次沙箱相关 REST 请求，绑定鉴权上下文。
 */
export async function runSandboxApiCall<T>(opts: {
  req: Request;
  operation: string;
  method: string;
  path: string;
  arguments: Record<string, unknown>;
  run: () => Promise<{ status: number; result: unknown; value: T }>;
}): Promise<T> {
  bindAuthRequest(opts.req);
  const outcome = await opts.run();
  return outcome.value;
}
