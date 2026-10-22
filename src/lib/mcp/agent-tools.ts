import { jsonError } from "@/lib/api/response";
import { recordMcpCall } from "@/lib/mcp/audit";
import {
  deleteSandboxFile,
  editSandboxFile,
  globSandbox,
  grepSandbox,
  writeSandboxFile,
  type GrepMode,
} from "@/lib/sandbox/agent-fs";
import { beginMcpActivity, endMcpActivity } from "@/lib/sandbox/idle";

type JsonRpcId = string | number | null;

type ToolDispatch = { kind: "response"; status: number; body: unknown };

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function toolText(body: unknown, isError: boolean) {
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

async function apiFailure(error: unknown) {
  const response = jsonError(error);
  return { status: response.status, body: (await response.json()) as unknown };
}

function requireSandboxId(args: Record<string, unknown>): string | null {
  return typeof args.id === "string" && args.id.length > 0 ? args.id : null;
}

async function withSandboxActivity(
  tool: string,
  path: string,
  args: Record<string, unknown>,
  sandboxId: string,
  request: Request,
  id: JsonRpcId,
  run: () => Promise<unknown>,
): Promise<ToolDispatch> {
  const startedAt = Date.now();
  await beginMcpActivity(sandboxId);
  try {
    const body = await run();
    await recordMcpCall({
      tool,
      method: "tools/call",
      path,
      arguments: args,
      status: 200,
      result: body,
      startedAt,
      channel: "mcp",
    });
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, toolText(body, false)),
    };
  } catch (error) {
    const failure = await apiFailure(error);
    await recordMcpCall({
      tool,
      method: "tools/call",
      path,
      arguments: args,
      status: failure.status,
      result: failure.body,
      startedAt,
      channel: "mcp",
    });
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, toolText(failure.body, true)),
    };
  } finally {
    await endMcpActivity(sandboxId, {
      touch: !request.signal.aborted,
    });
  }
}

async function missingId(
  tool: string,
  path: string,
  args: Record<string, unknown>,
  id: JsonRpcId,
): Promise<ToolDispatch> {
  await recordMcpCall({
    tool,
    method: "tools/call",
    path,
    arguments: args,
    status: 400,
    result: { error: "缺少参数 id" },
    channel: "mcp",
  });
  return {
    kind: "response",
    status: 200,
    body: rpcResult(id, toolText("缺少参数 id", true)),
  };
}

export async function callWrite(
  request: Request,
  id: JsonRpcId,
  args: Record<string, unknown>,
): Promise<ToolDispatch> {
  const sandboxId = requireSandboxId(args);
  if (!sandboxId) return missingId("write", "/mcp/write", args, id);
  return withSandboxActivity("write", "/mcp/write", args, sandboxId, request, id, () =>
    writeSandboxFile(
      sandboxId,
      String(args.path ?? ""),
      String(args.contents ?? ""),
      request.signal,
    ),
  );
}

export async function callEdit(
  request: Request,
  id: JsonRpcId,
  args: Record<string, unknown>,
): Promise<ToolDispatch> {
  const sandboxId = requireSandboxId(args);
  if (!sandboxId) return missingId("edit", "/mcp/edit", args, id);
  return withSandboxActivity("edit", "/mcp/edit", args, sandboxId, request, id, () =>
    editSandboxFile(
      sandboxId,
      String(args.path ?? ""),
      String(args.old_string ?? ""),
      String(args.new_string ?? ""),
      args.replace_all === true,
      request.signal,
    ),
  );
}

export async function callDelete(
  request: Request,
  id: JsonRpcId,
  args: Record<string, unknown>,
): Promise<ToolDispatch> {
  const sandboxId = requireSandboxId(args);
  if (!sandboxId) return missingId("delete", "/mcp/delete", args, id);
  return withSandboxActivity("delete", "/mcp/delete", args, sandboxId, request, id, () =>
    deleteSandboxFile(sandboxId, String(args.path ?? ""), request.signal),
  );
}

export async function callGrep(
  request: Request,
  id: JsonRpcId,
  args: Record<string, unknown>,
): Promise<ToolDispatch> {
  const sandboxId = requireSandboxId(args);
  if (!sandboxId) return missingId("grep", "/mcp/grep", args, id);
  const mode = args.output_mode;
  const outputMode: GrepMode | undefined =
    mode === "content" || mode === "files_with_matches" || mode === "count"
      ? mode
      : undefined;
  return withSandboxActivity("grep", "/mcp/grep", args, sandboxId, request, id, async () => {
    const result = await grepSandbox(sandboxId, {
      pattern: String(args.pattern ?? ""),
      path: typeof args.path === "string" ? args.path : undefined,
      glob: typeof args.glob === "string" ? args.glob : undefined,
      caseInsensitive: args.case_insensitive === true,
      outputMode,
      context: typeof args.context === "number" ? args.context : undefined,
      headLimit: typeof args.head_limit === "number" ? args.head_limit : undefined,
      multiline: args.multiline === true,
      signal: request.signal,
    });
    return result.text || "(无匹配)";
  });
}

export async function callGlob(
  request: Request,
  id: JsonRpcId,
  args: Record<string, unknown>,
): Promise<ToolDispatch> {
  const sandboxId = requireSandboxId(args);
  if (!sandboxId) return missingId("glob", "/mcp/glob", args, id);
  return withSandboxActivity("glob", "/mcp/glob", args, sandboxId, request, id, async () => {
    const result = await globSandbox(
      sandboxId,
      String(args.glob_pattern ?? ""),
      typeof args.target_directory === "string" ? args.target_directory : undefined,
      request.signal,
    );
    return {
      paths: result.paths,
      count: result.paths.length,
      text: result.paths.join("\n") || "(无匹配)",
    };
  });
}
