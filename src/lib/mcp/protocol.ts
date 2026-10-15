import { openApiDocument } from "@/lib/openapi/document";
import { callMcpTool, mcpRoutes } from "@/lib/mcp/call";
import { callSandboxArtifact } from "@/lib/mcp/artifact";
import { callSandboxCommand } from "@/lib/mcp/command";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const DEFAULT_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type McpDispatch =
  | { kind: "accepted" }
  | { kind: "response"; status: number; body: unknown }
  | { kind: "stream"; stream: ReadableStream<Uint8Array> };

function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function progressToken(params: Record<string, unknown> | null): string | number | undefined {
  const meta = params?._meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const token = (meta as Record<string, unknown>).progressToken;
  if (typeof token === "string" || typeof token === "number") return token;
  return undefined;
}

function acceptsEventStream(request: Request): boolean {
  const accept = request.headers.get("accept");
  if (!accept) return false;
  return accept
    .split(",")
    .some((part) => part.split(";")[0]?.trim().toLowerCase() === "text/event-stream");
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toolError(message: string) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function toolSuccess(status: number, body: unknown) {
  const isError = status >= 400;
  const text = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  const structured =
    !isError && body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  return {
    content: [{ type: "text" as const, text }],
    ...(structured ? { structuredContent: structured } : {}),
    ...(isError ? { isError: true } : {}),
  };
}

async function handleRequest(request: Request, message: JsonRpcRequest): Promise<McpDispatch> {
  const { id, method, params } = message;

  if (method === "ping") {
    return { kind: "response", status: 200, body: rpcResult(id, {}) };
  }

  if (method === "initialize") {
    const input = asObject(params);
    const requested = input?.protocolVersion;
    if (typeof requested !== "string" || !requested) {
      return {
        kind: "response",
        status: 200,
        body: rpcError(id, -32602, "protocolVersion 必填"),
      };
    }
    const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(
      requested as (typeof SUPPORTED_PROTOCOL_VERSIONS)[number],
    )
      ? requested
      : DEFAULT_PROTOCOL_VERSION;
    const info = openApiDocument().info;
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "boat", version: info.version },
        instructions: [
          info.description,
          "这些工具与 GET /api/openapi.json 中的沙箱接口一致，工具名即 operationId。",
          "认证与 REST 相同：Authorization: Bearer boat_...，或登录会话 cookie。",
          "runSandboxCommand 会用 SSE 持续推送 stdout/stderr，执行时间不限制；客户端断开即取消。命令结束后的最终结果里仍有 ok、exitCode、stdout、stderr。非零退出码时 ok 为 false。",
        ].join("\n"),
      }),
    };
  }

  if (method === "tools/list") {
    const input = asObject(params);
    if (input && "cursor" in input && input.cursor) {
      return {
        kind: "response",
        status: 200,
        body: rpcError(id, -32602, "不支持分页 cursor"),
      };
    }
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, {
        tools: mcpRoutes().map((route) => route.definition),
      }),
    };
  }

  if (method === "tools/call") {
    const input = asObject(params);
    const name = input?.name;
    if (typeof name !== "string" || !name) {
      return {
        kind: "response",
        status: 200,
        body: rpcError(id, -32602, "name 必填"),
      };
    }
    const args = input?.arguments === undefined ? {} : input.arguments;
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return {
        kind: "response",
        status: 200,
        body: rpcError(id, -32602, "arguments 必须是对象"),
      };
    }
    if (name === "runSandboxCommand") {
      return callSandboxCommand(
        request,
        id,
        args as Record<string, unknown>,
        progressToken(input),
        acceptsEventStream(request),
      );
    }
    if (name === "getSandboxArtifact") {
      return callSandboxArtifact(
        request,
        id,
        args as Record<string, unknown>,
        progressToken(input),
        acceptsEventStream(request),
      );
    }
    try {
      const outcome = await callMcpTool(request, name, args as Record<string, unknown>);
      return {
        kind: "response",
        status: 200,
        body: rpcResult(
          id,
          outcome.ok ? toolSuccess(outcome.status, outcome.body) : toolError(outcome.message),
        ),
      };
    } catch (error) {
      console.error(error);
      return {
        kind: "response",
        status: 200,
        body: rpcResult(id, toolError("服务器内部错误")),
      };
    }
  }

  return {
    kind: "response",
    status: 200,
    body: rpcError(id, -32601, `Method not found: ${method}`),
  };
}

/** 处理一条 JSON-RPC 消息。通知返回 202，请求返回 JSON-RPC 响应。 */
export async function dispatchMcp(request: Request, payload: unknown): Promise<McpDispatch> {
  if (Array.isArray(payload)) {
    return {
      kind: "response",
      status: 400,
      body: rpcError(null, -32600, "不支持 JSON-RPC 批处理"),
    };
  }

  const message = asObject(payload);
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string" || !message.method) {
    return {
      kind: "response",
      status: 400,
      body: rpcError(null, -32600, "无效的 JSON-RPC 请求"),
    };
  }

  const hasId = "id" in message;
  if (!hasId) {
    if (!message.method.startsWith("notifications/")) {
      return {
        kind: "response",
        status: 400,
        body: rpcError(null, -32600, "请求缺少 id"),
      };
    }
    return { kind: "accepted" };
  }

  if (message.id !== null && typeof message.id !== "string" && typeof message.id !== "number") {
    return {
      kind: "response",
      status: 400,
      body: rpcError(null, -32600, "id 必须是字符串、数字或 null"),
    };
  }

  return handleRequest(request, {
    jsonrpc: "2.0",
    id: message.id as JsonRpcId,
    method: message.method,
    params: message.params,
  });
}
