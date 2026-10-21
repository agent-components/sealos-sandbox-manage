import type { LaunchpadApp } from "@/lib/sealos/map";
import {
  clampDiskGi,
  nearestCpu,
  nearestMemoryGi,
} from "@/lib/sealos/resources";
import type { Template } from "@/lib/template/schema";

function currentDiskGi(app: LaunchpadApp): number {
  const raw = app.storage?.[0]?.size ?? "";
  const match = String(raw).match(/^(\d+(?:\.\d+)?)\s*Gi$/i);
  if (match) return clampDiskGi(Number(match[1]));
  return clampDiskGi(undefined);
}

/** 合并环境变量：先保留沙箱已有，同名再以模板覆盖 */
export function mergeEnvWithTemplate(
  appEnv: Array<{ name: string; value?: string }> | undefined,
  templateEnv: Template["env"] | undefined,
): { name: string; value: string }[] {
  const envMap = new Map<string, string>();
  for (const item of appEnv ?? []) {
    const name = item.name?.trim();
    if (!name) continue;
    envMap.set(name, item.value ?? "");
  }
  for (const item of templateEnv ?? []) {
    const name = item.name.trim();
    if (!name) continue;
    envMap.set(name, item.value ?? "");
  }
  return [...envMap.entries()].map(([name, value]) => ({ name, value }));
}

export type SyncFromTemplateOptions = {
  /** 覆盖合并后的环境变量（例如详情页已本地合并并再编辑过） */
  env?: { name: string; value: string }[];
  /** 覆盖保留的资源配置；省略则用当前应用值 */
  resources?: {
    cpu: number;
    memoryGi: number;
    diskGi: number;
    replicas?: number;
  };
};

/**
 * 按模板最新配置生成 Sealos PATCH body。
 * CPU / 内存 / 磁盘 / 实例数保持沙箱当前值；环境变量合并（同名以模板为准）；其余字段以模板为准。
 */
export function buildSyncFromTemplateBody(
  app: LaunchpadApp,
  template: Template,
  opts?: SyncFromTemplateOptions,
): Record<string, unknown> {
  const cpu = opts?.resources?.cpu ?? nearestCpu(app.quota?.cpu);
  const memoryGi =
    opts?.resources?.memoryGi ?? nearestMemoryGi(app.quota?.memory);
  const diskGi = opts?.resources?.diskGi ?? currentDiskGi(app);
  const replicas =
    opts?.resources?.replicas ??
    Math.max(1, Math.round(app.quota?.replicas ?? 1));

  const storage =
    (template.storage ?? []).length > 0
      ? template.storage.map((item, index) =>
          index === 0 ? { ...item, size: `${diskGi}Gi` } : item,
        )
      : [];

  return {
    image: {
      imageName: template.image,
      ...(template.imageRegistry
        ? { imageRegistry: template.imageRegistry }
        : { imageRegistry: null }),
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
      replicas,
    },
    ports:
      template.ports.length > 0
        ? template.ports.map((port) => ({
            number: port.number,
            protocol: port.protocol,
            isPublic: port.isPublic,
          }))
        : [{ number: 80, protocol: "http", isPublic: true }],
    env: opts?.env ?? mergeEnvWithTemplate(app.env, template.env),
    storage,
    configMap: (template.configMap ?? [])
      .filter((item) => item.path.trim())
      .map((item) => ({
        path: item.path.trim(),
        value: item.value ?? "",
      })),
  };
}
