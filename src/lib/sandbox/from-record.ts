import type { Sandbox } from "@/lib/sandbox/schema";
import type { SandboxRecordDoc } from "@/lib/sandbox/record";
import { DEFAULT_RESOURCES } from "@/lib/sealos/resources";
import { primaryDiskGi, type Template } from "@/lib/template/schema";

/** 用数据库记录 + 模板填充列表项（含已同步的 state）。 */
export function sandboxFromRecord(
  record: SandboxRecordDoc,
  template?: Template | null
): Sandbox {
  return {
    id: record.sandboxId,
    name: record.sandboxId,
    state: record.state,
    cpu: template?.cpu ?? DEFAULT_RESOURCES.cpu,
    memoryGi: template?.memoryGi ?? DEFAULT_RESOURCES.memoryGi,
    diskGi: template
      ? primaryDiskGi(template.storage)
      : DEFAULT_RESOURCES.diskGi,
    replicas: Math.max(1, template?.replicas ?? 1),
    publicUrl: null,
    ports: [],
    env: [],
    storage: [],
    configMap: [],
    image: template?.image,
    templateId: record.templateId || undefined,
    tags: record.tags,
    autoShutdown: record.autoShutdown,
    idleMinutes: record.idleMinutes,
    inflight: record.inflight,
    createdAt: record.createdAt.toISOString(),
  };
}
