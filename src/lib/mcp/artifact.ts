import { jsonError } from "@/lib/api/response";
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

/**
 * MCP 的 getSandboxArtifact。
 * 文本在 SSE 里随到随推；图片返回 base64；其他文件在工具结果里给 base64。
 * HTTP 接口对其他文件则是附件下载流。
 */
export async function callSandboxArtifact(
  request: Request,
  id: JsonRpcId,
  args: Record<string, unknown>,
  progressToken: string | number | undefined,
  stream: boolean,
): Promise<ArtifactDispatch> {
  if (typeof args.id !== "string" || args.id.length === 0) {
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, {
        content: [{ type: "text", text: "缺少参数 id" }],
        isError: true,
      }),
    };
  }

  let artifact: Awaited<ReturnType<typeof openSandboxArtifact>>;
  try {
    artifact = await openSandboxArtifact(args.id, String(args.path ?? ""), request.signal);
  } catch (error) {
    return { kind: "response", status: 200, body: await failureResult(id, error) };
  }

  if (artifact.kind === "image") {
    return {
      kind: "response",
      status: 200,
      body: rpcResult(id, {
        content: [
          {
            type: "text",
            text: `${artifact.mediaType}，${artifact.bytes} 字节`,
          },
          { type: "image", data: artifact.base64, mimeType: artifact.mediaType },
        ],
        structuredContent: {
          path: artifact.path,
          mediaType: artifact.mediaType,
          encoding: "base64",
          data: artifact.base64,
        },
      }),
    };
  }

  if (artifact.kind === "binary" || !stream) {
    try {
      const bytes = await readStream(artifact.stream);
      if (artifact.kind === "text") {
        return {
          kind: "response",
          status: 200,
          body: rpcResult(id, {
            content: [{ type: "text", text: bytes.toString("utf8") }],
            structuredContent: {
              path: artifact.path,
              mediaType: artifact.mediaType,
              encoding: "utf8",
              data: bytes.toString("utf8"),
            },
          }),
        };
      }
      return {
        kind: "response",
        status: 200,
        body: rpcResult(id, {
          content: [
            {
              type: "text",
              text: `${artifact.filename} 是二进制文件，${bytes.length} 字节。HTTP 接口以附件流下载。`,
            },
          ],
          structuredContent: {
            path: artifact.path,
            mediaType: artifact.mediaType,
            encoding: "base64",
            data: bytes.toString("base64"),
          },
        }),
      };
    } catch (error) {
      if (error instanceof ExecCancelledError || request.signal.aborted) {
        return { kind: "response", status: 499, body: rpcResult(id, { content: [{ type: "text", text: "已取消" }], isError: true }) };
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
        write(`event: message\ndata: ${JSON.stringify(payload)}\n\n${FLUSH_PAD}`);
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
        send(
          rpcResult(id, {
            content: [{ type: "text", text: data }],
            structuredContent: {
              path: artifact.path,
              mediaType: artifact.mediaType,
              encoding: "utf8",
              data,
            },
          }),
        );
      } catch (error) {
        if (abort.signal.aborted || request.signal.aborted) return;
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
      void artifact.stream.cancel();
    },
  });
  return { kind: "stream", stream: body };
}
