import type { Sandbox, SandboxState } from "@/lib/sandbox/schema";
import {
  clampDiskGi,
  nearestCpu,
  nearestMemoryGi,
} from "@/lib/sealos/resources";

/** Sealos Launchpad v2alpha 应用结构 */
export type LaunchpadApp = {
  name: string;
  image?: { imageName?: string };
  quota?: { cpu?: number; memory?: number; replicas?: number };
  ports?: Array<{
    number?: number;
    publicAddress?: string;
    customDomain?: string;
    privateAddress?: string;
  }>;
  env?: Array<{ name: string; value?: string }>;
  storage?: Array<{ name?: string; path?: string; size?: string }>;
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

export function mapAppPorts(app: LaunchpadApp) {
  return (app.ports ?? [])
    .filter((p) => typeof p.number === "number" && Number.isFinite(p.number))
    .map((p) => ({
      number: p.number as number,
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

export function toSandbox(app: LaunchpadApp, templateId?: string): Sandbox {
  return {
    id: app.name,
    name: app.name,
    state: mapLaunchpadStatus(app.status),
    cpu: nearestCpu(app.quota?.cpu),
    memoryGi: nearestMemoryGi(app.quota?.memory),
    diskGi: parseDiskGi(app),
    publicUrl: pickPublicUrl(app),
    ports: mapAppPorts(app),
    image: app.image?.imageName,
    templateId: templateId || undefined,
    tags: [],
    autoShutdown: false,
    idleMinutes: 5,
    createdAt: app.createdAt,
    upTime: app.upTime,
  };
}
