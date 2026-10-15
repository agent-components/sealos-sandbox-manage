import { getSealosConfig } from "@/lib/sealos/config";
import { SealosApiError } from "@/lib/sealos/errors";
import type { LaunchpadApp } from "@/lib/sealos/map";
import type { ResourceSpec } from "@/lib/sealos/resources";

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

export function createLaunchpadClient(opts: LaunchpadClientOptions) {
  const { kubeconfig, baseUrl } = opts;
  const config = getSealosConfig();

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

    async createApp(input: {
      name: string;
      resources: ResourceSpec;
      owner: string;
      image: string;
      port?: number;
      templateId: string;
    }): Promise<LaunchpadApp> {
      const imageName = input.image;
      const port = input.port ?? config.defaultPort;
      const { cpu, memoryGi, diskGi } = input.resources;

      const body = {
        name: input.name,
        image: { imageName },
        launchCommand: {},
        quota: {
          cpu,
          memory: memoryGi,
          replicas: 1,
        },
        ports: [
          {
            number: port,
            protocol: "http",
            isPublic: true,
          },
        ],
        env: [
          { name: "BOAT_SANDBOX", value: "true" },
          { name: "BOAT_USER", value: input.owner },
          { name: "BOAT_TEMPLATE", value: input.templateId },
        ],
        storage: [
          {
            name: "data",
            path: "/data",
            size: `${diskGi}Gi`,
          },
        ],
        configMap: [],
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
