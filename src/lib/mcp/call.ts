import { NextRequest } from "next/server";
import { DELETE as deleteSandbox, GET as getSandbox } from "@/app/api/v1/sandboxes/[id]/route";
import { GET as getSandboxArtifact } from "@/app/api/v1/sandboxes/[id]/artifacts/route";
import { POST as runSandboxCommand } from "@/app/api/v1/sandboxes/[id]/commands/route";
import { POST as resumeSandbox } from "@/app/api/v1/sandboxes/[id]/resume/route";
import { POST as stopSandbox } from "@/app/api/v1/sandboxes/[id]/stop/route";
import { GET as listSandboxes, POST as createSandbox } from "@/app/api/v1/sandboxes/route";
import { SANDBOX_CHANNEL_HEADER } from "@/lib/api/call-context";
import { mcpRoutesFromOpenApi, type McpRoute } from "@/lib/mcp/tools";

type RouteContext = { params: Promise<{ id: string }> };
type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<Response>;

const handlers: Record<string, RouteHandler> = {
  "GET /sandboxes": (req) => listSandboxes(req),
  "POST /sandboxes": (req) => createSandbox(req),
  "GET /sandboxes/{id}": (req, ctx) => getSandbox(req, ctx),
  "DELETE /sandboxes/{id}": (req, ctx) => deleteSandbox(req, ctx),
  "POST /sandboxes/{id}/stop": (req, ctx) => stopSandbox(req, ctx),
  "POST /sandboxes/{id}/resume": (req, ctx) => resumeSandbox(req, ctx),
  "POST /sandboxes/{id}/commands": (req, ctx) => runSandboxCommand(req, ctx),
  "GET /sandboxes/{id}/artifacts": (req, ctx) => getSandboxArtifact(req, ctx),
};

let cached: McpRoute[] | undefined;

export function mcpRoutes(): McpRoute[] {
  if (!cached) {
    const routes = mcpRoutesFromOpenApi();
    const seen = new Set<string>();
    for (const route of routes) {
      const key = `${route.method} ${route.path}`;
      if (!handlers[key]) {
        throw new Error(`OpenAPI 操作 ${route.definition.name}（${key}）没有对应的 MCP 处理函数`);
      }
      seen.add(key);
    }
    for (const key of Object.keys(handlers)) {
      if (!seen.has(key)) {
        throw new Error(`MCP 处理函数 ${key} 不在 OpenAPI 文档中`);
      }
    }
    cached = routes;
  }
  return cached;
}

export type ToolCallOutcome =
  | { ok: false; message: string }
  | { ok: true; status: number; body: unknown };

function appendQuery(url: URL, name: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item !== undefined && item !== null) url.searchParams.append(name, String(item));
    }
    return;
  }
  url.searchParams.append(name, String(value));
}

function splitArguments(
  route: McpRoute,
  args: Record<string, unknown>,
):
  | { ok: false; message: string }
  | {
      ok: true;
      pathParams: Record<string, string>;
      query: Record<string, unknown>;
      body: Record<string, unknown>;
    } {
  const pathParams: Record<string, string> = {};
  for (const name of route.pathParams) {
    const value = args[name];
    if (typeof value !== "string" || value.length === 0) {
      return { ok: false, message: `缺少参数 ${name}` };
    }
    pathParams[name] = value;
  }

  const query: Record<string, unknown> = {};
  for (const name of route.queryParams) {
    if (args[name] !== undefined) query[name] = args[name];
  }

  const body: Record<string, unknown> = {};
  if (route.bodyProperties) {
    for (const name of route.bodyProperties) {
      if (args[name] !== undefined) body[name] = args[name];
    }
  }

  return { ok: true, pathParams, query, body };
}

/**
 * 用同一次请求里的登录态调用现有 Route Handler。
 * `requireUser` 读取的是当前请求的 cookie / Authorization，而不是这个合成请求。
 */
export async function callMcpTool(
  incoming: Request,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallOutcome> {
  const route = mcpRoutes().find((item) => item.definition.name === name);
  if (!route) return { ok: false, message: `未知工具：${name}` };

  const split = splitArguments(route, args);
  if (!split.ok) return split;

  let pathname = route.path;
  for (const [key, value] of Object.entries(split.pathParams)) {
    pathname = pathname.replaceAll(`{${key}}`, encodeURIComponent(value));
  }
  const url = new URL(`/api/v1${pathname}`, "http://sandbox.internal");
  for (const [key, value] of Object.entries(split.query)) {
    appendQuery(url, key, value);
  }

  const headers = new Headers();
  const authorization = incoming.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const cookie = incoming.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  headers.set(SANDBOX_CHANNEL_HEADER, "mcp");

  const hasBody = route.bodyProperties !== null;
  if (hasBody) headers.set("content-type", "application/json");

  const request = new NextRequest(url, {
    method: route.method,
    headers,
    ...(hasBody ? { body: JSON.stringify(split.body) } : {}),
  });
  const handler = handlers[`${route.method} ${route.path}`];
  const response = await handler(request, {
    params: Promise.resolve(split.pathParams as { id: string }),
  });
  const text = await response.text();
  if (!text) return { ok: true, status: response.status, body: null };
  try {
    return { ok: true, status: response.status, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: true, status: response.status, body: text };
  }
}
