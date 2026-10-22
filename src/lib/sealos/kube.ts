import crypto from "crypto";
import https from "https";
import type { Socket } from "net";
import { URL } from "url";
import { load as loadYaml } from "js-yaml";
import { SealosApiError } from "@/lib/sealos/errors";

export type KubeContext = {
  server: string;
  namespace: string;
  token: string;
  agent: https.Agent;
};

type KubeconfigFile = {
  "current-context": string;
  contexts: {
    name: string;
    context: { cluster: string; user: string; namespace?: string };
  }[];
  clusters: {
    name: string;
    cluster: { server: string; "certificate-authority-data"?: string };
  }[];
  users: {
    name: string;
    user: { token?: string };
  }[];
};

export function loadKubeContext(kubeconfigYaml: string): KubeContext {
  const kc = loadYaml(kubeconfigYaml) as KubeconfigFile;
  const ctxName = kc["current-context"];
  const ctx = kc.contexts.find((c) => c.name === ctxName)?.context;
  if (!ctx) throw new Error("kubeconfig 缺少 current-context");
  const cluster = kc.clusters.find((c) => c.name === ctx.cluster)?.cluster;
  const user = kc.users.find((u) => u.name === ctx.user)?.user;
  if (!cluster?.server) throw new Error("kubeconfig 缺少 cluster.server");
  if (!user?.token) throw new Error("kubeconfig 缺少 user.token");
  if (!ctx.namespace) throw new Error("kubeconfig 缺少 context.namespace");

  const ca = cluster["certificate-authority-data"]
    ? Buffer.from(cluster["certificate-authority-data"], "base64")
    : undefined;

  return {
    server: cluster.server.replace(/\/$/, ""),
    namespace: ctx.namespace,
    token: user.token,
    agent: new https.Agent({
      ca,
      rejectUnauthorized: Boolean(ca),
    }),
  };
}

async function k8sRequest(
  ctx: KubeContext,
  path: string,
  init?: { method?: string }
): Promise<{ status: number; body: string; contentType: string }> {
  const url = new URL(path, ctx.server);
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: init?.method ?? "GET",
        agent: ctx.agent,
        headers: {
          Authorization: `Bearer ${ctx.token}`,
          Accept: "application/json, text/plain, */*",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            contentType: String(res.headers["content-type"] ?? ""),
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

export type KubePodSummary = {
  name: string;
  phase: string;
  container: string;
  ready: boolean;
};

export async function listAppPods(
  kubeconfigYaml: string,
  appName: string
): Promise<KubePodSummary[]> {
  const ctx = loadKubeContext(kubeconfigYaml);
  const selectors = [
    `app=${appName}`,
    `cloud.sealos.io/app-deploy-manager=${appName}`,
  ];

  for (const selector of selectors) {
    const path = `/api/v1/namespaces/${encodeURIComponent(
      ctx.namespace
    )}/pods?labelSelector=${encodeURIComponent(selector)}`;
    const res = await k8sRequest(ctx, path);
    if (res.status !== 200) continue;
    const data = JSON.parse(res.body) as {
      items?: Array<{
        metadata: { name: string };
        status?: {
          phase?: string;
          containerStatuses?: Array<{ ready?: boolean }>;
        };
        spec?: { containers?: Array<{ name: string }> };
      }>;
    };
    const items = data.items ?? [];
    if (!items.length) continue;
    return items.map((item) => ({
      name: item.metadata.name,
      phase: item.status?.phase ?? "Unknown",
      container: item.spec?.containers?.[0]?.name ?? appName,
      ready: Boolean(item.status?.containerStatuses?.some((c) => c.ready)),
    }));
  }
  return [];
}

export async function getPodLogs(
  kubeconfigYaml: string,
  opts: {
    pod: string;
    container: string;
    tailLines?: number;
    previous?: boolean;
  }
): Promise<{ logs: string; status: number }> {
  const ctx = loadKubeContext(kubeconfigYaml);
  const params = new URLSearchParams({
    container: opts.container,
    timestamps: "true",
    tailLines: String(opts.tailLines ?? 500),
  });
  if (opts.previous) params.set("previous", "true");

  const path = `/api/v1/namespaces/${encodeURIComponent(
    ctx.namespace
  )}/pods/${encodeURIComponent(opts.pod)}/log?${params}`;
  const res = await k8sRequest(ctx, path);
  if (res.status >= 200 && res.status < 300) {
    return { logs: res.body, status: res.status };
  }

  let message = res.body;
  try {
    const err = JSON.parse(res.body) as { message?: string };
    if (err.message) message = err.message;
  } catch {
    // keep raw
  }
  throw Object.assign(new Error(message || `获取日志失败（${res.status}）`), {
    status: res.status,
  });
}

const EXEC_TIMEOUT_MS = 60_000;
const EXEC_MAX_BYTES = 1024 * 1024;

export type PodExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type PodExecChunk = {
  stream: "stdout" | "stderr";
  text: string;
};

/** 客户端断开或主动取消时抛出。 */
export class ExecCancelledError extends Error {
  constructor() {
    super("命令已取消");
    this.name = "ExecCancelledError";
  }
}

/** 解析 pods/exec 状态通道。成功为 0，非零退出码取自 ExitCode。 */
export function parseExecExitCode(raw: string): number {
  const text = raw.trim();
  if (!text) return 0;
  try {
    const status = JSON.parse(text) as {
      status?: string;
      message?: string;
      details?: { causes?: Array<{ reason?: string; message?: string }> };
    };
    if (status.status === "Success") return 0;
    const cause = status.details?.causes?.find(
      (item) => item.reason === "ExitCode"
    );
    if (cause?.message && /^\d+$/.test(cause.message))
      return Number(cause.message);
    const match = status.message?.match(/exit code[: ]+(\d+)/i);
    if (match) return Number(match[1]);
  } catch {
    const match = text.match(/exit code[: ]+(\d+)/i);
    if (match) return Number(match[1]);
  }
  return 1;
}

function takeFrame(
  buf: Buffer
): { rest: Buffer; fin: boolean; opcode: number; payload: Buffer } | null {
  if (buf.length < 2) return null;
  const fin = (buf[0]! & 0x80) !== 0;
  const opcode = buf[0]! & 0x0f;
  let len = buf[1]! & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    const wide = buf.readBigUInt64BE(2);
    if (wide > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new SealosApiError("命令输出帧过大", 413);
    }
    len = Number(wide);
    offset = 10;
  }
  if (buf.length < offset + len) return null;
  return {
    rest: buf.subarray(offset + len),
    fin,
    opcode,
    payload: buf.subarray(offset, offset + len),
  };
}

function sendPong(socket: Socket) {
  const frame = Buffer.alloc(6);
  frame[0] = 0x8a;
  frame[1] = 0x80;
  socket.write(frame);
}

/** 客户端发往服务端的 WebSocket 二进制帧（必须带 mask）。 */
function sendMaskedBinary(socket: Socket, payload: Buffer) {
  const mask = crypto.randomBytes(4);
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x82;
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x82;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x82;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i += 1) {
    masked[i] = payload[i]! ^ mask[i % 4]!;
  }
  socket.write(Buffer.concat([header, mask, masked]));
}

/** 向 pods/exec 的 stdin 通道（channel 0）写入数据。 */
function writeStdin(socket: Socket, data: Buffer) {
  const chunkSize = 32 * 1024;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const slice = data.subarray(offset, offset + chunkSize);
    sendMaskedBinary(socket, Buffer.concat([Buffer.from([0]), slice]));
  }
}

/**
 * 在 Pod 内执行命令，收回 stdout、stderr 和退出码。
 * 使用 Kubernetes pods/exec 的 WebSocket 协议（v4.channel.k8s.io）。
 * `timeoutMs` 未传时 60 秒；小于等于 0 表示不限制。`onOutput` 在输出到达时回调。
 * 传入 `stdin` 时打开标准输入并向 channel 0 写入；进程侧宜用 `head -c N` 等按字节读完即退出。
 */
export async function execInPod(
  kubeconfigYaml: string,
  opts: {
    pod: string;
    container: string;
    command: string[];
    /** 写入容器 stdin 的内容。 */
    stdin?: Buffer | string;
    timeoutMs?: number;
    /** 标准输出上限。未传时 1MB。 */
    maxBytes?: number;
    /** 为 false 时不在内存里攒标准输出，交给 onStdout。 */
    retainStdout?: boolean;
    tooLargeMessage?: string;
    signal?: AbortSignal;
    onOutput?: (chunk: PodExecChunk) => void;
    onStdout?: (chunk: Buffer) => void;
  }
): Promise<PodExecResult> {
  const ctx = loadKubeContext(kubeconfigYaml);
  const stdinBuffer =
    opts.stdin === undefined
      ? undefined
      : typeof opts.stdin === "string"
      ? Buffer.from(opts.stdin, "utf8")
      : opts.stdin;
  const params = new URLSearchParams();
  for (const part of opts.command) params.append("command", part);
  params.set("container", opts.container);
  params.set("stdout", "true");
  params.set("stderr", "true");
  params.set("stdin", stdinBuffer ? "true" : "false");
  params.set("tty", "false");
  const url = new URL(
    `/api/v1/namespaces/${encodeURIComponent(
      ctx.namespace
    )}/pods/${encodeURIComponent(opts.pod)}/exec?${params}`,
    ctx.server
  );

  const timeoutMs =
    opts.timeoutMs === undefined ? EXEC_TIMEOUT_MS : opts.timeoutMs;

  return new Promise((resolve, reject) => {
    let settled = false;
    let socket: Socket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stdoutDecoder = new TextDecoder();
    const stderrDecoder = new TextDecoder();

    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      socket?.destroy();
      req.destroy();
      action();
    };
    const onAbort = () => settle(() => reject(new ExecCancelledError()));

    const req = https.request(
      url,
      {
        method: "GET",
        agent: ctx.agent,
        headers: {
          Authorization: `Bearer ${ctx.token}`,
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64"),
          "Sec-WebSocket-Protocol": "v4.channel.k8s.io",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          let message = body;
          try {
            const err = JSON.parse(body) as { message?: string };
            if (err.message) message = err.message;
          } catch {
            // keep raw
          }
          const status = res.statusCode ?? 502;
          settle(() =>
            reject(
              new SealosApiError(
                message || `执行命令失败（${status}）`,
                status >= 400 && status < 600 ? status : 502
              )
            )
          );
        });
      }
    );

    if (opts.signal?.aborted) {
      settle(() => reject(new ExecCancelledError()));
      return;
    }
    opts.signal?.addEventListener("abort", onAbort);
    if (timeoutMs > 0) {
      timer = setTimeout(
        () => settle(() => reject(new SealosApiError("命令执行超时", 504))),
        timeoutMs
      );
    }

    const emit = (
      stream: "stdout" | "stderr",
      data: Buffer,
      decoder: TextDecoder
    ) => {
      const text = decoder.decode(data, { stream: true });
      if (text) opts.onOutput?.({ stream, text });
    };

    req.on("upgrade", (_res, upgraded: Socket) => {
      socket = upgraded;
      let buf: Buffer = Buffer.alloc(0);
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const statusBytes: Buffer[] = [];
      let stdoutLen = 0;
      let stderrLen = 0;
      let pendingOp = 0;
      let pending: Buffer[] = [];

      const fail = (error: Error) => settle(() => reject(error));
      const succeed = () =>
        settle(() => {
          const tailOut = stdoutDecoder.decode();
          const tailErr = stderrDecoder.decode();
          if (tailOut) opts.onOutput?.({ stream: "stdout", text: tailOut });
          if (tailErr) opts.onOutput?.({ stream: "stderr", text: tailErr });
          resolve({
            exitCode: parseExecExitCode(
              Buffer.concat(statusBytes).toString("utf8")
            ),
            stdout: Buffer.concat(stdout).toString("utf8"),
            stderr: Buffer.concat(stderr).toString("utf8"),
          });
        });

      const stdoutLimit = opts.maxBytes ?? EXEC_MAX_BYTES;
      const retainStdout = opts.retainStdout !== false;
      const pushStream = (
        chunks: Buffer[],
        current: number,
        data: Buffer,
        label: "stdout" | "stderr"
      ) => {
        const limit = label === "stdout" ? stdoutLimit : EXEC_MAX_BYTES;
        if (current + data.length > limit) {
          const message =
            label === "stdout" && opts.tooLargeMessage
              ? opts.tooLargeMessage
              : `命令${label === "stdout" ? "标准输出" : "标准错误"}超过 1MB`;
          fail(new SealosApiError(message, 413));
          return current;
        }
        if (label === "stderr" || retainStdout) chunks.push(data);
        return current + data.length;
      };

      const dispatch = (opcode: number, payload: Buffer) => {
        if ((opcode !== 0x1 && opcode !== 0x2) || payload.length === 0) return;
        const channel = payload[0]!;
        const data = payload.subarray(1);
        if (channel === 1) {
          const next = pushStream(stdout, stdoutLen, data, "stdout");
          if (next !== stdoutLen) {
            stdoutLen = next;
            if (opts.onStdout) opts.onStdout(Buffer.from(data));
            else emit("stdout", data, stdoutDecoder);
          }
        } else if (channel === 2) {
          const next = pushStream(stderr, stderrLen, data, "stderr");
          if (next !== stderrLen) {
            stderrLen = next;
            emit("stderr", data, stderrDecoder);
          }
        } else if (channel === 3) statusBytes.push(data);
      };

      if (stdinBuffer) {
        try {
          writeStdin(upgraded, stdinBuffer);
        } catch (error) {
          fail(error instanceof Error ? error : new Error("写入标准输入失败"));
          return;
        }
      }

      upgraded.on("data", (chunk: Buffer) => {
        if (settled) return;
        buf = Buffer.concat([buf, chunk]);
        try {
          while (!settled) {
            const frame = takeFrame(buf);
            if (!frame) break;
            buf = frame.rest;
            if (frame.opcode === 0x9) {
              sendPong(upgraded);
              continue;
            }
            if (frame.opcode === 0x8) {
              succeed();
              return;
            }
            if (frame.opcode === 0x0) {
              pending.push(frame.payload);
              if (frame.fin) {
                dispatch(pendingOp, Buffer.concat(pending));
                pending = [];
              }
              continue;
            }
            if (frame.opcode === 0x1 || frame.opcode === 0x2) {
              if (!frame.fin) {
                pendingOp = frame.opcode;
                pending = [frame.payload];
              } else {
                dispatch(frame.opcode, frame.payload);
              }
            }
          }
        } catch (error) {
          fail(error instanceof Error ? error : new Error("解析命令输出失败"));
        }
      });
      upgraded.on("end", () => succeed());
      upgraded.on("error", (error) => fail(error));
    });

    req.on("error", (error) => settle(() => reject(error)));
    req.end();
  });
}
