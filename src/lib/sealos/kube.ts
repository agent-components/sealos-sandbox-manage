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
  contexts: { name: string; context: { cluster: string; user: string; namespace?: string } }[];
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
  init?: { method?: string },
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
      },
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
  appName: string,
): Promise<KubePodSummary[]> {
  const ctx = loadKubeContext(kubeconfigYaml);
  const selectors = [
    `app=${appName}`,
    `cloud.sealos.io/app-deploy-manager=${appName}`,
  ];

  for (const selector of selectors) {
    const path = `/api/v1/namespaces/${encodeURIComponent(ctx.namespace)}/pods?labelSelector=${encodeURIComponent(selector)}`;
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
  },
): Promise<{ logs: string; status: number }> {
  const ctx = loadKubeContext(kubeconfigYaml);
  const params = new URLSearchParams({
    container: opts.container,
    timestamps: "true",
    tailLines: String(opts.tailLines ?? 500),
  });
  if (opts.previous) params.set("previous", "true");

  const path = `/api/v1/namespaces/${encodeURIComponent(ctx.namespace)}/pods/${encodeURIComponent(opts.pod)}/log?${params}`;
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
    const cause = status.details?.causes?.find((item) => item.reason === "ExitCode");
    if (cause?.message && /^\d+$/.test(cause.message)) return Number(cause.message);
    const match = status.message?.match(/exit code[: ]+(\d+)/i);
    if (match) return Number(match[1]);
  } catch {
    const match = text.match(/exit code[: ]+(\d+)/i);
    if (match) return Number(match[1]);
  }
  return 1;
}

function takeFrame(buf: Buffer): { rest: Buffer; fin: boolean; opcode: number; payload: Buffer } | null {
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

/**
 * 在 Pod 内容一次性执行命令，收回 stdout、stderr 和退出码。
 * 使用 Kubernetes pods/exec 的 WebSocket 协议（v4.channel.k8s.io）。
 */
export async function execInPod(
  kubeconfigYaml: string,
  opts: { pod: string; container: string; command: string[]; timeoutMs?: number },
): Promise<PodExecResult> {
  const ctx = loadKubeContext(kubeconfigYaml);
  const params = new URLSearchParams();
  for (const part of opts.command) params.append("command", part);
  params.set("container", opts.container);
  params.set("stdout", "true");
  params.set("stderr", "true");
  params.set("stdin", "false");
  params.set("tty", "false");
  const url = new URL(
    `/api/v1/namespaces/${encodeURIComponent(ctx.namespace)}/pods/${encodeURIComponent(opts.pod)}/exec?${params}`,
    ctx.server,
  );

  return new Promise((resolve, reject) => {
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
          reject(
            new SealosApiError(
              message || `执行命令失败（${status}）`,
              status >= 400 && status < 600 ? status : 502,
            ),
          );
        });
      },
    );

    req.on("upgrade", (_res, socket) => {
      let buf = Buffer.alloc(0);
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const statusBytes: Buffer[] = [];
      let stdoutLen = 0;
      let stderrLen = 0;
      let pendingOp = 0;
      let pending: Buffer[] = [];
      let settled = false;

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        reject(error);
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve({
          exitCode: parseExecExitCode(Buffer.concat(statusBytes).toString("utf8")),
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      };
      const timer = setTimeout(
        () => fail(new SealosApiError("命令执行超时", 504)),
        opts.timeoutMs ?? EXEC_TIMEOUT_MS,
      );

      const pushStream = (chunks: Buffer[], current: number, data: Buffer, label: "stdout" | "stderr") => {
        if (current + data.length > EXEC_MAX_BYTES) {
          fail(new SealosApiError(`命令${label === "stdout" ? "标准输出" : "标准错误"}超过 1MB`, 413));
          return current;
        }
        chunks.push(data);
        return current + data.length;
      };

      const dispatch = (opcode: number, payload: Buffer) => {
        if ((opcode !== 0x1 && opcode !== 0x2) || payload.length === 0) return;
        const channel = payload[0]!;
        const data = payload.subarray(1);
        if (channel === 1) stdoutLen = pushStream(stdout, stdoutLen, data, "stdout");
        else if (channel === 2) stderrLen = pushStream(stderr, stderrLen, data, "stderr");
        else if (channel === 3) statusBytes.push(data);
      };

      socket.on("data", (chunk: Buffer) => {
        if (settled) return;
        buf = Buffer.concat([buf, chunk]);
        try {
          while (!settled) {
            const frame = takeFrame(buf);
            if (!frame) break;
            buf = frame.rest;
            if (frame.opcode === 0x9) {
              sendPong(socket);
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
      socket.on("end", () => succeed());
      socket.on("error", (error) => fail(error));
    });

    req.on("error", reject);
    req.end();
  });
}
