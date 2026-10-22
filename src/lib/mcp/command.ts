import { jsonError } from "@/lib/api/response";
import { recordMcpCall } from "@/lib/mcp/audit";
import { beginMcpActivity, endMcpActivity } from "@/lib/sandbox/idle";
import {
  ArtifactPathSchema,
  RunSandboxCommandSchema,
} from "@/lib/sandbox/schema";
import { resolveSandboxForCommand } from "@/lib/sandbox/command";
import {
  ExecCancelledError,
  execInPod,
  type PodExecChunk,
  type PodExecResult,
} from "@/lib/sealos/kube";

type JsonRpcId = string | number | null;

type CommandDispatch =
  | { kind: "response"; status: number; body: unknown }
  | { kind: "stream"; stream: ReadableStream<Uint8Array> };

const HEARTBEAT_MS = 15_000;
/** 撑开压缩和反向代理的缓冲，避免静默时心跳停在缓冲区里。 */
const FLUSH_PAD = `: ${" ".repeat(2048)}\n\n`;

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

function commandBody(result: PodExecResult) {
  return {
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function outputMessage(chunk: PodExecChunk) {
  return {
    jsonrpc: "2.0" as const,
    method: "notifications/message",
    params: {
      level: chunk.stream === "stderr" ? "warning" : "info",
      logger: chunk.stream,
      data: chunk.text,
    },
  };
}

function progressMessage(
  token: string | number,
  progress: number,
  chunk: PodExecChunk
) {
  return {
    jsonrpc: "2.0" as const,
    method: "notifications/progress",
    params: {
      progressToken: token,
      progress,
      message:
        chunk.stream === "stderr" ? `[stderr] ${chunk.text}` : chunk.text,
    },
  };
}

/**
 * MCP 的 exec（对标 Cursor Shell）。
 * 接受 SSE 时边执行边推送输出，并且不限制执行时间；客户端断开则取消命令。
 * 不接受 SSE 时仍等到命令结束再返回 JSON，同样不限时。
 * 沙箱已停止时会先开机再执行。
 */
export async function callSandboxCommand(
  request: Request,
  id: JsonRpcId,
  args: Record<string, unknown>,
  progressToken: string | number | undefined,
  stream: boolean
): Promise<CommandDispatch> {
  const startedAt = Date.now();
  if (typeof args.id !== "string" || args.id.length === 0) {
    await auditCommand(args, 400, { error: "缺少参数 id" }, startedAt);
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, toolText("缺少参数 id", true)),
    };
  }
  const parsed = RunSandboxCommandSchema.safeParse({ command: args.command });
  if (!parsed.success) {
    const failure = await apiFailure(parsed.error);
    await auditCommand(args, failure.status, failure.body, startedAt);
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, toolText(failure.body, true)),
    };
  }

  let workingDirectory: string | undefined;
  if (args.working_directory !== undefined && args.working_directory !== null) {
    const cwd = ArtifactPathSchema.safeParse(args.working_directory);
    if (!cwd.success) {
      const failure = await apiFailure(cwd.error);
      await auditCommand(args, failure.status, failure.body, startedAt);
      return {
        kind: "response",
        status: 200,
        body: rpcResult(id, toolText(failure.body, true)),
      };
    }
    workingDirectory = cwd.data;
  }

  const sandboxId = args.id;
  await beginMcpActivity(sandboxId);

  let target: Awaited<ReturnType<typeof resolveSandboxForCommand>>;
  try {
    target = await resolveSandboxForCommand(sandboxId, request.signal);
  } catch (error) {
    const failure = await apiFailure(error);
    await endMcpActivity(sandboxId, {
      touch: failure.status !== 401 && failure.status !== 403,
    });
    await auditCommand(args, failure.status, failure.body, startedAt);
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, toolText(failure.body, true)),
    };
  }

  const command = workingDirectory
    ? [
        "/bin/sh",
        "-c",
        'cd -- "$1" && /bin/sh -c "$2"',
        "exec",
        workingDirectory,
        parsed.data.command,
      ]
    : ["/bin/sh", "-c", parsed.data.command];
  if (!stream) {
    try {
      const result = await execInPod(target.kubeconfig, {
        pod: target.pod,
        container: target.container,
        command,
        timeoutMs: 0,
        signal: request.signal,
      });
      const body = commandBody(result);
      await auditCommand(args, 200, body, startedAt);
      return {
        kind: "response",
        status: 200,
        body: rpcResult(id, toolText(body, false)),
      };
    } catch (error) {
      if (error instanceof ExecCancelledError || request.signal.aborted) {
        await auditCommand(args, 499, { error: "命令已取消" }, startedAt);
        return {
          kind: "response",
          status: 499,
          body: rpcResult(id, toolText("命令已取消", true)),
        };
      }
      const failure = await apiFailure(error);
      await auditCommand(args, failure.status, failure.body, startedAt);
      return {
        kind: "response",
        status: 200,
        body: rpcResult(id, toolText(failure.body, true)),
      };
    } finally {
      await endMcpActivity(sandboxId, { touch: true });
    }
  }

  const abort = new AbortController();
  const onRequestAbort = () => abort.abort();
  request.signal.addEventListener("abort", onRequestAbort);

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let progress = 0;
      let closed = false;

      const write = (bytes: string) => {
        if (closed || abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(bytes));
        } catch {
          abort.abort();
        }
      };
      const send = (payload: unknown) => {
        write(
          `event: message\ndata: ${JSON.stringify(payload)}\n\n${FLUSH_PAD}`
        );
      };
      const heartbeat = setInterval(() => {
        write(`: ping\n\n${FLUSH_PAD}`);
      }, HEARTBEAT_MS);
      write(`: open\n\n${FLUSH_PAD}`);

      try {
        const result = await execInPod(target.kubeconfig, {
          pod: target.pod,
          container: target.container,
          command,
          timeoutMs: 0,
          signal: abort.signal,
          onOutput: (chunk) => {
            if (!chunk.text) return;
            send(outputMessage(chunk));
            if (progressToken !== undefined) {
              progress += 1;
              send(progressMessage(progressToken, progress, chunk));
            }
          },
        });
        const body = commandBody(result);
        await auditCommand(args, 200, body, startedAt);
        send(rpcResult(id, toolText(body, false)));
      } catch (error) {
        if (
          error instanceof ExecCancelledError ||
          abort.signal.aborted ||
          request.signal.aborted
        ) {
          await auditCommand(args, 499, { error: "命令已取消" }, startedAt);
          return;
        }
        const failure = await apiFailure(error);
        await auditCommand(args, failure.status, failure.body, startedAt);
        send(rpcResult(id, toolText(failure.body, true)));
      } finally {
        clearInterval(heartbeat);
        request.signal.removeEventListener("abort", onRequestAbort);
        await endMcpActivity(sandboxId, { touch: true });
        closed = true;
        try {
          controller.close();
        } catch {
          // 客户端已经断开
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return { kind: "stream", stream: body };
}

function auditCommand(
  args: Record<string, unknown>,
  status: number,
  result: unknown,
  startedAt: number
) {
  return recordMcpCall({
    tool: "exec",
    method: "tools/call",
    path: "/mcp/exec",
    arguments: args,
    status,
    result,
    startedAt,
    channel: "mcp",
  });
}

async function apiFailure(error: unknown) {
  const response = jsonError(error);
  return { status: response.status, body: (await response.json()) as unknown };
}
