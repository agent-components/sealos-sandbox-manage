import { dispatchMcp, SUPPORTED_PROTOCOL_VERSIONS } from "@/lib/mcp/protocol";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, x-sandbox-id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
  "Cache-Control": "no-store",
};

function isLocalOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/** 浏览器跨站请求必须带 Origin。原生 MCP 客户端通常不带，直接放行。 */
function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (isLocalOrigin(origin)) return true;
  const host = request.headers.get("host")?.split(":")[0];
  try {
    return Boolean(host) && new URL(origin).hostname === host;
  } catch {
    return false;
  }
}

function jsonResponse(body: unknown, status: number, extra?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { ...CORS_HEADERS, ...extra },
  });
}

function negotiateProtocol(request: Request): string | null {
  const requested = request.headers.get("mcp-protocol-version");
  if (!requested) return null;
  return SUPPORTED_PROTOCOL_VERSIONS.includes(
    requested as (typeof SUPPORTED_PROTOCOL_VERSIONS)[number],
  )
    ? requested
    : null;
}

function wantsEventStream(request: Request): boolean {
  const accept = request.headers.get("accept");
  if (!accept) return false;
  const types = accept.split(",").map((part) => part.split(";")[0]?.trim().toLowerCase());
  return types.includes("text/event-stream") && !types.includes("application/json") && !types.includes("*/*");
}

function respond(request: Request, status: number, body: unknown) {
  const protocol = negotiateProtocol(request);
  const headers: Record<string, string> = {};
  if (protocol) headers["MCP-Protocol-Version"] = protocol;
  if (status === 200 && wantsEventStream(request)) {
    return new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        ...headers,
        "Content-Type": "text/event-stream",
      },
    });
  }
  return jsonResponse(body, status, headers);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function GET() {
  return jsonResponse(
    { jsonrpc: "2.0", id: null, error: { code: -32000, message: "此服务为无状态 MCP，不提供服务端事件流" } },
    405,
    { Allow: "POST, OPTIONS" },
  );
}

export function DELETE() {
  return jsonResponse(
    { jsonrpc: "2.0", id: null, error: { code: -32000, message: "此服务不使用 MCP 会话" } },
    405,
    { Allow: "POST, OPTIONS" },
  );
}

export async function POST(request: Request) {
  if (!originAllowed(request)) {
    return jsonResponse(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Origin 不被允许" } },
      403,
    );
  }

  const requestedProtocol = request.headers.get("mcp-protocol-version");
  if (requestedProtocol && !negotiateProtocol(request)) {
    return jsonResponse(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "不支持的 MCP-Protocol-Version" } },
      400,
    );
  }

  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return jsonResponse(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Content-Type 必须是 application/json" } },
      415,
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      400,
    );
  }

  const result = await dispatchMcp(request, payload);
  if (result.kind === "accepted") {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }
  if (result.kind === "stream") {
    const protocol = negotiateProtocol(request);
    return new Response(result.stream, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        ...(protocol ? { "MCP-Protocol-Version": protocol } : {}),
      },
    });
  }
  return respond(request, result.status, result.body);
}
