import { jsonError } from "@/lib/api/response";
import { RunSandboxCommandSchema } from "@/lib/sandbox/schema";
import { resolveRunningSandbox } from "@/lib/sandbox/command";
import { ExecCancelledError, execInPod, type PodExecChunk, type PodExecResult } from "@/lib/sealos/kube";

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

async function failureResult(id: JsonRpcId, error: unknown) {
  const response = jsonError(error);
  return rpcResult(id, toolText(await response.json(), response.status >= 400));
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

function progressMessage(token: string | number, progress: number, chunk: PodExecChunk) {
  return {
    jsonrpc: "2.0" as const,
    method: "notifications/progress",
    params: {
      progressToken: token,
      progress,
      message: chunk.stream === "stderr" ? `[stderr] ${chunk.text}` : chunk.text,
    },
  };
}

/**
 * MCP 的 runSandboxCommand。
 * 接受 SSE 时边执行边推送输出，并且不限制执行时间；客户端断开则取消命令。
 * 不接受 SSE 时仍等到命令结束再返回 JSON，同样不限时。
 */
export async function callSandboxCommand(
  request: Request,
  id: JsonRpcId,
  args: Record<string, unknown>,
  progressToken: string | number | undefined,
  stream: boolean,
): Promise<CommandDispatch> {
  if (typeof args.id !== "string" || args.id.length === 0) {
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, toolText("缺少参数 id", true)),
    };
  }
  const parsed = RunSandboxCommandSchema.safeParse({ command: args.command });
  if (!parsed.success) {
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, toolText(await failureBody(parsed.error), true)),
    };
  }

  let target: Awaited<ReturnType<typeof resolveRunningSandbox>>;
  try {
    target = await resolveRunningSandbox(args.id);
  } catch (error) {
    return { kind: "response", status: 200, body: await failureResult(id, error) };
  }

  const command = ["/bin/sh", "-c", parsed.data.command];
  if (!stream) {
    try {
      const result = await execInPod(target.kubeconfig, {
        pod: target.pod,
        container: target.container,
        command,
        timeoutMs: 0,
        signal: request.signal,
      });
      return {
        kind: "response",
        status: 200,
        body: rpcResult(id, toolText(commandBody(result), false)),
      };
    } catch (error) {
      if (error instanceof ExecCancelledError || request.signal.aborted) {
        return { kind: "response", status: 499, body: rpcResult(id, toolText("命令已取消", true)) };
      }
      return { kind: "response", status: 200, body: await failureResult(id, error) };
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
        write(`event: message\ndata: ${JSON.stringify(payload)}\n\n${FLUSH_PAD}`);
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
        send(rpcResult(id, toolText(commandBody(result), false)));
      } catch (error) {
        if (error instanceof ExecCancelledError || abort.signal.aborted || request.signal.aborted) {
          return;
        }
        send(await failureResult(id, error));
      } finally {
        clearInterval(heartbeat);
        request.signal.removeEventListener("abort", onRequestAbort);
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

async function failureBody(error: unknown) {
  const response = jsonError(error);
  return response.json();
}
