import { getSealosConfig } from "@/lib/sealos/config";
import { SealosApiError } from "@/lib/sealos/errors";
import type { LaunchpadApp } from "@/lib/sealos/map";
import type { ResourceSpec } from "@/lib/sealos/resources";
import type { Template } from "@/lib/template/schema";
import { primaryDiskGi } from "@/lib/template/schema";

export type LaunchpadClientOptions = {
  kubeconfig: string;
  baseUrl?: string;
};

async function launchpadFetch<T>(
  kubeconfig: string,
  path: string,
  init: RequestInit = {},
  baseUrl?: string,
): Promise<T> {
  const config = getSealosConfig();
  const url = `${(baseUrl ?? config.launchpadBase).replace(/\/$/, "")}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", encodeURIComponent(kubeconfig));
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  if (!res.ok) {
    const message =
      typeof json === "object" &&
      json &&
      "message" in json &&
      typeof (json as { message: unknown }).message === "string"
        ? (json as { message: string }).message
        : `Sealos Launchpad 错误 ${res.status}`;
    throw new SealosApiError(message, res.status, json);
  }

  return json as T;
}

export type CreateFromTemplateInput = {
  name: string;
  owner: string;
  template: Template;
  resources?: Partial<ResourceSpec>;
  /** 创建时追加/覆盖的环境变量（同名覆盖模板） */
  env?: { name: string; value: string }[];
};

export function createLaunchpadClient(opts: LaunchpadClientOptions) {
  const { kubeconfig, baseUrl } = opts;

  return {
    async listApps(): Promise<LaunchpadApp[]> {
      return launchpadFetch<LaunchpadApp[]>(
        kubeconfig,
        "/api/v2alpha/apps",
        { method: "GET" },
        baseUrl,
      );
    },

    async getApp(name: string): Promise<LaunchpadApp> {
      return launchpadFetch<LaunchpadApp>(
        kubeconfig,
        `/api/v2alpha/apps/${encodeURIComponent(name)}`,
        { method: "GET" },
        baseUrl,
      );
    },

    async createAppFromTemplate(
      input: CreateFromTemplateInput,
    ): Promise<LaunchpadApp> {
      const { template } = input;
      const cpu = input.resources?.cpu ?? template.cpu;
      const memoryGi = input.resources?.memoryGi ?? template.memoryGi;
      const diskGi =
        input.resources?.diskGi ?? primaryDiskGi(template.storage);

      const storage =
        (template.storage ?? []).length > 0
          ? template.storage.map((s, i) =>
              i === 0 && input.resources?.diskGi
                ? { ...s, size: `${diskGi}Gi` }
                : s,
            )
          : [];

      const reserved = new Set([
        "BOAT_SANDBOX",
        "BOAT_USER",
        "BOAT_TEMPLATE",
      ]);
      const envMap = new Map<string, string>();
      for (const e of template.env ?? []) {
        if (!e.name.trim() || reserved.has(e.name)) continue;
        envMap.set(e.name.trim(), e.value ?? "");
      }
      for (const e of input.env ?? []) {
        if (!e.name.trim() || reserved.has(e.name.trim())) continue;
        envMap.set(e.name.trim(), e.value ?? "");
      }

      const body = {
        name: input.name,
        image: {
          imageName: template.image,
          ...(template.imageRegistry
            ? { imageRegistry: template.imageRegistry }
            : {}),
        },
        launchCommand: {
          ...(template.launchCommand?.command
            ? { command: template.launchCommand.command }
            : {}),
          ...(template.launchCommand?.args?.length
            ? { args: template.launchCommand.args }
            : {}),
        },
        quota: {
          cpu,
          memory: memoryGi,
          replicas: template.replicas ?? 1,
        },
        ports:
          template.ports.length > 0
            ? template.ports.map((p) => ({
                number: p.number,
                protocol: p.protocol,
                isPublic: p.isPublic,
              }))
            : [{ number: 80, protocol: "http", isPublic: true }],
        env: [
          { name: "BOAT_SANDBOX", value: "true" },
          { name: "BOAT_USER", value: input.owner },
          { name: "BOAT_TEMPLATE", value: template.id },
          ...[...envMap.entries()].map(([name, value]) => ({ name, value })),
        ],
        storage,
        configMap: (template.configMap ?? [])
          .filter((c) => c.path.trim())
          .map((c) => ({
            path: c.path.trim(),
            value: c.value ?? "",
          })),
      };

      return launchpadFetch<LaunchpadApp>(
        kubeconfig,
        "/api/v2alpha/apps",
        { method: "POST", body: JSON.stringify(body) },
        baseUrl,
      );
    },

    async updateApp(
      name: string,
      resources: ResourceSpec,
    ): Promise<LaunchpadApp> {
      await launchpadFetch(
        kubeconfig,
        `/api/v2alpha/apps/${encodeURIComponent(name)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            quota: {
              cpu: resources.cpu,
              memory: resources.memoryGi,
              replicas: 1,
            },
            storage: [
              {
                path: "/data",
                size: `${resources.diskGi}Gi`,
              },
            ],
          }),
        },
        baseUrl,
      );
      return this.getApp(name);
    },

    async deleteApp(name: string): Promise<void> {
      await launchpadFetch(
        kubeconfig,
        `/api/v2alpha/apps/${encodeURIComponent(name)}`,
        { method: "DELETE" },
        baseUrl,
      );
    },

    async pauseApp(name: string): Promise<void> {
      await launchpadFetch(
        kubeconfig,
        `/api/pauseApp?appName=${encodeURIComponent(name)}`,
        { method: "GET" },
        baseUrl,
      );
    },

    async startApp(name: string): Promise<void> {
      await launchpadFetch(
        kubeconfig,
        `/api/startApp?appName=${encodeURIComponent(name)}`,
        { method: "GET" },
        baseUrl,
      );
    },
  };
}

export type LaunchpadClient = ReturnType<typeof createLaunchpadClient>;
