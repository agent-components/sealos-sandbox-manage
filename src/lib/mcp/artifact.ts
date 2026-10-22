import { jsonError } from "@/lib/api/response";
import { recordMcpCall } from "@/lib/mcp/audit";
import { beginMcpActivity, endMcpActivity } from "@/lib/sandbox/idle";
import { openSandboxArtifact } from "@/lib/sandbox/artifact";
import { ExecCancelledError } from "@/lib/sealos/kube";

type JsonRpcId = string | number | null;

type ArtifactDispatch =
  | { kind: "response"; status: number; body: unknown }
  | { kind: "stream"; stream: ReadableStream<Uint8Array> };

const HEARTBEAT_MS = 15_000;
const FLUSH_PAD = `: ${" ".repeat(2048)}\n\n`;

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

async function failureResult(id: JsonRpcId, error: unknown) {
  const response = jsonError(error);
  const body = await response.json();
  return rpcResult(id, {
    content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }],
    isError: true,
  });
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const parts: Buffer[] = [];
  while (true) {
    const piece = await reader.read();
    if (piece.done) break;
    parts.push(Buffer.from(piece.value));
  }
  return Buffer.concat(parts);
}

async function apiFailure(error: unknown) {
  const response = jsonError(error);
  return { status: response.status, body: (await response.json()) as unknown };
}

function auditRead(
  args: Record<string, unknown>,
  status: number,
  result: unknown,
  startedAt: number
) {
  return recordMcpCall({
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
 * 供 MCP `read` 在图片/二进制场景复用。
 * 文本在 SSE 里随到随推；图片返回 base64；其他文件在工具结果里给 base64。
 */
export async function callSandboxArtifact(
  request: Request,
  id: JsonRpcId,
  args: Record<string, unknown>,
  progressToken: string | number | undefined,
  stream: boolean,
  startedAt = Date.now()
): Promise<ArtifactDispatch> {
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
  await beginMcpActivity(sandboxId);

  let artifact: Awaited<ReturnType<typeof openSandboxArtifact>>;
  try {
    artifact = await openSandboxArtifact(
      sandboxId,
      String(args.path ?? ""),
      request.signal
    );
  } catch (error) {
    const failure = await apiFailure(error);
    await auditRead(args, failure.status, failure.body, startedAt);
    await endMcpActivity(sandboxId, {
      touch: failure.status !== 401 && failure.status !== 403,
    });
    return {
      kind: "response",
      status: 200,
      body: await failureResult(id, error),
    };
  }

  if (artifact.kind === "image") {
    const payload = {
      path: artifact.path,
      mediaType: artifact.mediaType,
      encoding: "base64" as const,
      data: artifact.base64,
      bytes: artifact.bytes,
    };
    await auditRead(args, 200, payload, startedAt);
    await endMcpActivity(sandboxId, { touch: true });
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, {
        content: [
          {
            type: "text",
            text: `${artifact.mediaType}，${artifact.bytes} 字节`,
          },
          {
            type: "image",
            data: artifact.base64,
            mimeType: artifact.mediaType,
          },
        ],
        structuredContent: payload,
      }),
    };
  }

  if (artifact.kind === "binary" || !stream) {
    try {
      const bytes = await readStream(artifact.stream);
      if (artifact.kind === "text") {
        const payload = {
          path: artifact.path,
          mediaType: artifact.mediaType,
          encoding: "utf8" as const,
          data: bytes.toString("utf8"),
        };
        await auditRead(args, 200, payload, startedAt);
        return {
          kind: "response",
          status: 200,
          body: rpcResult(id, {
            content: [{ type: "text", text: payload.data }],
            structuredContent: payload,
          }),
        };
      }
      const payload = {
        path: artifact.path,
        mediaType: artifact.mediaType,
        encoding: "base64" as const,
        data: bytes.toString("base64"),
        bytes: bytes.length,
      };
      await auditRead(args, 200, payload, startedAt);
      return {
        kind: "response",
        status: 200,
        body: rpcResult(id, {
          content: [
            {
              type: "text",
              text: `${artifact.filename} 是二进制文件，${bytes.length} 字节。`,
            },
          ],
          structuredContent: payload,
        }),
      };
    } catch (error) {
      if (error instanceof ExecCancelledError || request.signal.aborted) {
        await auditRead(args, 499, { error: "已取消" }, startedAt);
        return {
          kind: "response",
          status: 499,
          body: rpcResult(id, {
            content: [{ type: "text", text: "已取消" }],
            isError: true,
          }),
        };
      }
      const failure = await apiFailure(error);
      await auditRead(args, failure.status, failure.body, startedAt);
      return {
        kind: "response",
        status: 200,
        body: await failureResult(id, error),
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
      const decoder = new TextDecoder();
      let progress = 0;
      let closed = false;
      const collected: string[] = [];
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
      const reader = artifact.stream.getReader();
      try {
        while (true) {
          const piece = await reader.read();
          if (piece.done) break;
          const text = decoder.decode(piece.value, { stream: true });
          if (!text) continue;
          collected.push(text);
          send({
            jsonrpc: "2.0",
            method: "notifications/message",
            params: { level: "info", logger: "stdout", data: text },
          });
          if (progressToken !== undefined) {
            progress += 1;
            send({
              jsonrpc: "2.0",
              method: "notifications/progress",
              params: { progressToken, progress, message: text },
            });
          }
        }
        const tail = decoder.decode();
        if (tail) collected.push(tail);
        const data = collected.join("");
        const payload = {
          path: artifact.path,
          mediaType: artifact.mediaType,
          encoding: "utf8" as const,
          data,
        };
        await auditRead(args, 200, payload, startedAt);
        send(
          rpcResult(id, {
            content: [{ type: "text", text: data }],
            structuredContent: payload,
          })
        );
      } catch (error) {
        if (abort.signal.aborted || request.signal.aborted) {
          await auditRead(args, 499, { error: "已取消" }, startedAt);
          return;
        }
        const failure = await apiFailure(error);
        await auditRead(args, failure.status, failure.body, startedAt);
        send(await failureResult(id, error));
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
      void artifact.stream.cancel();
    },
  });
  return { kind: "stream", stream: body };
}
