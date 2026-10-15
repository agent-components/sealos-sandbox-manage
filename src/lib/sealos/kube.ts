import https from "https";
import { URL } from "url";
import yaml from "js-yaml";

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
  const kc = yaml.load(kubeconfigYaml) as KubeconfigFile;
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
