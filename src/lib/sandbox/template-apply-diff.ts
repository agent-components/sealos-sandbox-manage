import type { Sandbox, SandboxEnv } from "@/lib/sandbox/schema";
import { mergeEnvWithTemplate } from "@/lib/sandbox/sync-from-template";
import { assignStorageNames } from "@/lib/sealos/storage-name";
import type { Template } from "@/lib/template/schema";

export type TemplateDraft = {
  image?: string;
  imageRegistry: Sandbox["imageRegistry"];
  launchCommand?: Sandbox["launchCommand"];
  ports: Sandbox["ports"];
  storage: Sandbox["storage"];
  configMap: Sandbox["configMap"];
};

export type TemplateDiffItem = {
  label: string;
  before: string;
  after: string;
};

export function draftFromTemplate(
  template: Template,
  diskGi: number,
): TemplateDraft {
  const storage = assignStorageNames(
    (template.storage ?? []).map((item, index) =>
      index === 0 ? { ...item, size: `${diskGi}Gi` } : item,
    ),
  );
  return {
    image: template.image,
    imageRegistry: template.imageRegistry
      ? {
          username: template.imageRegistry.username,
          serverAddress: template.imageRegistry.serverAddress,
          hasPassword: Boolean(template.imageRegistry.password),
        }
      : null,
    launchCommand: template.launchCommand,
    ports: (template.ports ?? []).map((port) => ({
      number: port.number,
      protocol: port.protocol,
      isPublic: port.isPublic,
      publicAddress: null,
      privateAddress: null,
    })),
    storage,
    configMap: (template.configMap ?? []).map((item) => ({
      path: item.path,
      value: item.value ?? "",
    })),
  };
}

function formatEmpty(value: string) {
  return value.trim() ? value : "（空）";
}

function formatLaunchCommand(value?: Sandbox["launchCommand"]) {
  const command = value?.command?.trim() || "";
  const args = (value?.args ?? []).join(" ").trim();
  if (!command && !args) return "（未设置）";
  if (command && args) return `${command} ${args}`;
  return command || args;
}

function formatRegistry(value: Sandbox["imageRegistry"]) {
  if (!value) return "（未配置）";
  const parts = [
    value.serverAddress?.trim() || "",
    value.username ? `用户 ${value.username}` : "",
    value.hasPassword ? "已设密码" : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "已配置";
}

function formatPorts(ports: Sandbox["ports"]) {
  if (!ports.length) return "（无）";
  return ports
    .map((port) => {
      const protocol = (port.protocol || "http").toUpperCase();
      const pub = port.isPublic === false ? "内网" : "公网";
      return `${port.number}/${protocol}/${pub}`;
    })
    .sort((a, b) => a.localeCompare(b, "en"))
    .join("，");
}

function formatStorage(storage: Sandbox["storage"]) {
  if (!storage.length) return "（无）";
  return storage
    .map((item) => {
      const name = item.name?.trim() || "unnamed";
      return `${name}:${item.path}${item.size ? `(${item.size})` : ""}`;
    })
    .sort((a, b) => a.localeCompare(b, "en"))
    .join("，");
}

function formatConfigMap(configMap: Sandbox["configMap"]) {
  if (!configMap.length) return "（无）";
  return configMap
    .map((item) => {
      const value = item.value ?? "";
      const preview =
        value.length > 40 ? `${value.slice(0, 40)}…` : value || "（空）";
      return `${item.path} → ${preview}`;
    })
    .join("；");
}

function formatEnv(list: SandboxEnv[]) {
  const normalized = normalizeEnv(list);
  if (!normalized.length) return "（无）";
  return normalized
    .map((item) => `${item.name}=${item.value || "（空）"}`)
    .join("，");
}

function formatIdle(value: { autoShutdown: boolean; idleMinutes: number }) {
  if (!value.autoShutdown) return "关闭";
  return `空闲 ${value.idleMinutes} 分钟后关机`;
}

function pushDiff(
  items: TemplateDiffItem[],
  label: string,
  before: string,
  after: string,
) {
  if (before === after) return;
  items.push({ label, before, after });
}

export function normalizeEnv(list: SandboxEnv[]) {
  return list
    .map((item) => ({
      name: item.name.trim(),
      value: item.value ?? "",
    }))
    .filter((item) => item.name);
}

export function buildTemplateApplyDiff(input: {
  current: {
    image?: string;
    imageRegistry: Sandbox["imageRegistry"];
    launchCommand?: Sandbox["launchCommand"];
    ports: Sandbox["ports"];
    storage: Sandbox["storage"];
    configMap: Sandbox["configMap"];
    env: SandboxEnv[];
    idle: { autoShutdown: boolean; idleMinutes: number };
  };
  nextDraft: TemplateDraft;
  nextEnv: SandboxEnv[];
  nextIdle: { autoShutdown: boolean; idleMinutes: number };
}): TemplateDiffItem[] {
  const items: TemplateDiffItem[] = [];
  pushDiff(
    items,
    "镜像",
    formatEmpty(input.current.image ?? ""),
    formatEmpty(input.nextDraft.image ?? ""),
  );
  pushDiff(
    items,
    "私有镜像仓库",
    formatRegistry(input.current.imageRegistry),
    formatRegistry(input.nextDraft.imageRegistry),
  );
  pushDiff(
    items,
    "运行命令",
    formatLaunchCommand(input.current.launchCommand),
    formatLaunchCommand(input.nextDraft.launchCommand),
  );
  pushDiff(
    items,
    "网络配置",
    formatPorts(input.current.ports),
    formatPorts(input.nextDraft.ports),
  );
  pushDiff(
    items,
    "目录映射",
    formatStorage(input.current.storage),
    formatStorage(input.nextDraft.storage),
  );
  pushDiff(
    items,
    "文件映射",
    formatConfigMap(input.current.configMap),
    formatConfigMap(input.nextDraft.configMap),
  );

  const currentEnv = new Map(
    normalizeEnv(input.current.env).map((item) => [item.name, item.value]),
  );
  const nextEnv = new Map(
    normalizeEnv(input.nextEnv).map((item) => [item.name, item.value]),
  );
  const envNames = new Set([...currentEnv.keys(), ...nextEnv.keys()]);
  for (const name of [...envNames].sort()) {
    const before = currentEnv.get(name);
    const after = nextEnv.get(name);
    if (before === after) continue;
    if (before === undefined) {
      items.push({
        label: `环境变量 ${name}（新增）`,
        before: "—",
        after: formatEmpty(after ?? ""),
      });
    } else if (after === undefined) {
      items.push({
        label: `环境变量 ${name}（移除）`,
        before: formatEmpty(before),
        after: "—",
      });
    } else {
      items.push({
        label: `环境变量 ${name}`,
        before: formatEmpty(before),
        after: formatEmpty(after),
      });
    }
  }

  pushDiff(
    items,
    "自动关机",
    formatIdle(input.current.idle),
    formatIdle(input.nextIdle),
  );

  if (
    items.length === 0 &&
    formatEnv(input.current.env) !== formatEnv(input.nextEnv)
  ) {
    pushDiff(
      items,
      "环境变量",
      formatEnv(input.current.env),
      formatEnv(input.nextEnv),
    );
  }

  return items;
}

/** 按沙箱当前磁盘，算出套用最新模板后的字段，供 diff 使用。 */
export function previewTemplateApply(sandbox: Sandbox, template: Template) {
  const nextDraft = draftFromTemplate(template, sandbox.diskGi);
  const nextEnv = mergeEnvWithTemplate(sandbox.env, template.env);
  const nextIdle = {
    autoShutdown: template.autoShutdown ?? false,
    idleMinutes: template.idleMinutes ?? 5,
  };
  const diffs = buildTemplateApplyDiff({
    current: {
      image: sandbox.image,
      imageRegistry: sandbox.imageRegistry,
      launchCommand: sandbox.launchCommand,
      ports: sandbox.ports ?? [],
      storage: sandbox.storage ?? [],
      configMap: sandbox.configMap ?? [],
      env: sandbox.env ?? [],
      idle: {
        autoShutdown: sandbox.autoShutdown,
        idleMinutes: sandbox.idleMinutes,
      },
    },
    nextDraft,
    nextEnv,
    nextIdle,
  });
  return { nextDraft, nextEnv, nextIdle, diffs };
}
