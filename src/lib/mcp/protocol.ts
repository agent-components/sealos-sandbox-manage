import { openApiDocument } from "@/lib/openapi/document";
import {
  callDelete,
  callEdit,
  callGlob,
  callGrep,
  callWrite,
} from "@/lib/mcp/agent-tools";
import { callSandboxCommand } from "@/lib/mcp/command";
import { callRead } from "@/lib/mcp/read";
import { mcpTools } from "@/lib/mcp/tools";

export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;
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

function progressToken(
  params: Record<string, unknown> | null
): string | number | undefined {
  const meta = params?._meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta))
    return undefined;
  const token = (meta as Record<string, unknown>).progressToken;
  if (typeof token === "string" || typeof token === "number") return token;
  return undefined;
}

function acceptsEventStream(request: Request): boolean {
  const accept = request.headers.get("accept");
  if (!accept) return false;
  return accept
    .split(",")
    .some(
      (part) => part.split(";")[0]?.trim().toLowerCase() === "text/event-stream"
    );
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

async function handleRequest(
  request: Request,
  message: JsonRpcRequest
): Promise<McpDispatch> {
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
      requested as (typeof SUPPORTED_PROTOCOL_VERSIONS)[number]
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
        serverInfo: { name: info.title, version: info.version },
        instructions: [
          "MCP 工具对标 Cursor Agent 本地文件操作：read、write、edit、delete、grep、glob、exec。",
          "与 OpenAPI/REST 独立；创建/列表/关机等沙箱管理请走 REST。",
          "每个工具需传沙箱 id；路径为沙箱内绝对路径。",
          "认证与 REST 相同：Authorization: Bearer sandbox_...，或登录会话 cookie。",
          "读/写/搜文件用专用工具；exec 仅用于跑命令。exec 可 SSE 推送输出且不限时。",
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
        tools: mcpTools(),
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
    const toolArgs = args as Record<string, unknown>;
    if (name === "read") {
      return callRead(
        request,
        id,
        toolArgs,
        progressToken(input),
        acceptsEventStream(request)
      );
    }
    if (name === "write") return callWrite(request, id, toolArgs);
    if (name === "edit") return callEdit(request, id, toolArgs);
    if (name === "delete") return callDelete(request, id, toolArgs);
    if (name === "grep") return callGrep(request, id, toolArgs);
    if (name === "glob") return callGlob(request, id, toolArgs);
    if (name === "exec") {
      return callSandboxCommand(
        request,
        id,
        toolArgs,
        progressToken(input),
        acceptsEventStream(request)
      );
    }
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, toolError(`未知工具：${name}`)),
    };
  }

  return {
    kind: "response",
    status: 200,
    body: rpcError(id, -32601, `Method not found: ${method}`),
  };
}

/** 处理一条 JSON-RPC 消息。通知返回 202，请求返回 JSON-RPC 响应。 */
export async function dispatchMcp(
  request: Request,
  payload: unknown
): Promise<McpDispatch> {
  if (Array.isArray(payload)) {
    return {
      kind: "response",
      status: 400,
      body: rpcError(null, -32600, "不支持 JSON-RPC 批处理"),
    };
  }

  const message = asObject(payload);
  if (
    !message ||
    message.jsonrpc !== "2.0" ||
    typeof message.method !== "string" ||
    !message.method
  ) {
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

  if (
    message.id !== null &&
    typeof message.id !== "string" &&
    typeof message.id !== "number"
  ) {
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
