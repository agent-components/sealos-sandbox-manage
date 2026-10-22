import { jsonError } from "@/lib/api/response";
import { recordMcpCall } from "@/lib/mcp/audit";
import { callSandboxArtifact } from "@/lib/mcp/artifact";
import { readSandboxText, sniffSandboxPath } from "@/lib/sandbox/agent-fs";
import { beginMcpActivity, endMcpActivity } from "@/lib/sandbox/idle";

type JsonRpcId = string | number | null;

type ReadDispatch =
  | { kind: "response"; status: number; body: unknown }
  | { kind: "stream"; stream: ReadableStream<Uint8Array> };

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

async function auditRead(
  args: Record<string, unknown>,
  status: number,
  result: unknown,
  startedAt: number,
) {
  await recordMcpCall({
    tool: "read",
    method: "tools/call",
    path: "/mcp/read",
    arguments: args,
    status,
    result,
    startedAt,
    channel: "mcp",
  });
}

/**
 * MCP read：图片/二进制委托 openSandboxArtifact；文本按 offset/limit 行读。
 */
export async function callRead(
  request: Request,
  id: JsonRpcId,
  args: Record<string, unknown>,
  progressToken: string | number | undefined,
  stream: boolean,
): Promise<ReadDispatch> {
  const startedAt = Date.now();
  if (typeof args.id !== "string" || args.id.length === 0) {
    await auditRead(args, 400, { error: "缺少参数 id" }, startedAt);
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, {
        content: [{ type: "text", text: "缺少参数 id" }],
        isError: true,
      }),
    };
  }

  const sandboxId = args.id;
  const path = String(args.path ?? "");
  const offset = typeof args.offset === "number" ? args.offset : undefined;
  const limit = typeof args.limit === "number" ? args.limit : undefined;

  let kind: "text" | "image" | "binary";
  try {
    const sniffed = await sniffSandboxPath(sandboxId, path, request.signal);
    kind = sniffed.kind;
  } catch (error) {
    const response = jsonError(error);
    const body = await response.json();
    await auditRead(args, response.status, body, startedAt);
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
        isError: true,
      }),
    };
  }

  if (kind === "image" || kind === "binary") {
    return callSandboxArtifact(request, id, args, progressToken, stream, startedAt);
  }

  await beginMcpActivity(sandboxId);
  try {
    const result = await readSandboxText(sandboxId, path, {
      offset,
      limit,
      signal: request.signal,
    });
    const note =
      offset === undefined && limit === undefined && result.totalLines > 0
        ? `\n\n(共 ${result.totalLines} 行)`
        : "";
    const payload = {
      path: result.path,
      totalLines: result.totalLines,
      encoding: "utf8",
      data: result.content,
    };
    await auditRead(args, 200, payload, startedAt);
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, {
        content: [{ type: "text", text: `${result.content}${note}` }],
        structuredContent: payload,
      }),
    };
  } catch (error) {
    const response = jsonError(error);
    const body = await response.json();
    await auditRead(args, response.status, body, startedAt);
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
        isError: true,
      }),
    };
  } finally {
    await endMcpActivity(sandboxId, { touch: true });
  }
}
