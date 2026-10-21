import type { Sandbox, SandboxState } from "@/lib/sandbox/schema";
import {
  clampDiskGi,
  nearestCpu,
  nearestMemoryGi,
} from "@/lib/sealos/resources";

const PORT_PROTOCOLS = [
  "http",
  "grpc",
  "ws",
  "tcp",
  "udp",
  "sctp",
] as const;

type PortProtocol = (typeof PORT_PROTOCOLS)[number];

/** Sealos Launchpad v2alpha 应用结构 */
export type LaunchpadApp = {
  name: string;
  image?: {
    imageName?: string;
    imageRegistry?: {
      username?: string;
      password?: string;
      serverAddress?: string;
    };
  };
  launchCommand?: {
    command?: string;
    args?: string[];
  };
  quota?: { cpu?: number; memory?: number; replicas?: number };
  ports?: Array<{
    number?: number;
    protocol?: string;
    isPublic?: boolean;
    publicAddress?: string;
    customDomain?: string;
    privateAddress?: string;
  }>;
  env?: Array<{ name: string; value?: string }>;
  storage?: Array<{ name?: string; path?: string; size?: string }>;
  configMap?: Array<{ path?: string; value?: string }>;
  status?: string;
  createdAt?: string;
  upTime?: string;
  uid?: string;
};

export function mapLaunchpadStatus(status?: string): SandboxState {
  switch ((status ?? "").toLowerCase()) {
    case "running":
      return "running";
    case "pause":
      return "stopped";
    case "error":
      return "error";
    case "creating":
    case "waiting":
      return "starting";
    default:
      return "starting";
  }
}

function mapPortProtocol(value?: string): PortProtocol | undefined {
  const normalized = (value ?? "").toLowerCase();
  return PORT_PROTOCOLS.find((item) => item === normalized);
}

export function mapAppPorts(app: LaunchpadApp) {
  return (app.ports ?? [])
    .filter((p) => typeof p.number === "number" && Number.isFinite(p.number))
    .map((p) => ({
      number: p.number as number,
      protocol: mapPortProtocol(p.protocol),
      isPublic: typeof p.isPublic === "boolean" ? p.isPublic : undefined,
      publicAddress: p.publicAddress?.trim() || p.customDomain?.trim() || null,
      privateAddress: p.privateAddress?.trim() || null,
    }));
}

export function pickPublicUrl(app: LaunchpadApp): string | null {
  const port = mapAppPorts(app).find((p) => p.publicAddress);
  return port?.publicAddress ?? null;
}

function parseDiskGi(app: LaunchpadApp): number {
  const raw = app.storage?.[0]?.size ?? "";
  const match = String(raw).match(/^(\d+(?:\.\d+)?)\s*Gi$/i);
  if (match) return clampDiskGi(Number(match[1]));
  return clampDiskGi(undefined);
}

function mapAppEnv(app: LaunchpadApp) {
  return (app.env ?? [])
    .filter((e) => typeof e.name === "string" && e.name.trim())
    .map((e) => ({
      name: e.name.trim(),
      value: e.value ?? "",
    }));
}

function mapAppStorage(app: LaunchpadApp) {
  return (app.storage ?? [])
    .filter((s) => typeof s.path === "string" && s.path.trim())
    .map((s) => ({
      name: s.name?.trim() || undefined,
      path: s.path!.trim(),
      size: s.size?.trim() || undefined,
    }));
}

function mapAppConfigMap(app: LaunchpadApp) {
  return (app.configMap ?? [])
    .filter((c) => typeof c.path === "string" && c.path.trim())
    .map((c) => ({
      path: c.path!.trim(),
      value: c.value ?? "",
    }));
}

function mapLaunchCommand(app: LaunchpadApp) {
  const command = app.launchCommand?.command?.trim();
  const args = (app.launchCommand?.args ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  if (!command && args.length === 0) return undefined;
  return {
    ...(command ? { command } : {}),
    ...(args.length ? { args } : {}),
  };
}

function mapImageRegistry(app: LaunchpadApp) {
  const registry = app.image?.imageRegistry;
  if (!registry) return null;
  const username = registry.username?.trim() || undefined;
  const serverAddress = registry.serverAddress?.trim() || undefined;
  const hasPassword = Boolean(registry.password);
  if (!username && !serverAddress && !hasPassword) return null;
  return { username, serverAddress, hasPassword };
}

export function toSandbox(app: LaunchpadApp, templateId?: string): Sandbox {
  return {
    id: app.name,
    name: app.name,
    state: mapLaunchpadStatus(app.status),
    cpu: nearestCpu(app.quota?.cpu),
    memoryGi: nearestMemoryGi(app.quota?.memory),
    diskGi: parseDiskGi(app),
    replicas: Math.max(1, Math.round(app.quota?.replicas ?? 1)),
    publicUrl: pickPublicUrl(app),
    ports: mapAppPorts(app),
    env: mapAppEnv(app),
    storage: mapAppStorage(app),
    configMap: mapAppConfigMap(app),
    launchCommand: mapLaunchCommand(app),
    image: app.image?.imageName,
    imageRegistry: mapImageRegistry(app),
    templateId: templateId || undefined,
    tags: [],
    autoShutdown: false,
    idleMinutes: 5,
    createdAt: app.createdAt,
    upTime: app.upTime,
  };
}
