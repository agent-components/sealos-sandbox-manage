import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_IDLE_CONFIG,
  SandboxStateSchema,
  type IdleConfig,
  type SandboxState,
} from "@/lib/sandbox/schema";

export type SandboxRecordDoc = {
  sandboxId: string;
  owner: string;
  templateId: string;
  regionId: string;
  tags: string[];
  state: SandboxState;
  autoShutdown: boolean;
  idleMinutes: number;
  inflight: number;
  lastActivityAt: Date;
  createdAt: Date;
};

type RecordRow = {
  sandboxId: string;
  owner: string;
  templateId: string;
  regionId: string;
  tags: string[];
  state: string;
  autoShutdown: boolean;
  idleMinutes: number;
  inflight: number;
  lastActivityAt: Date;
  createdAt: Date;
};

export type ListSandboxRecordsOptions = {
  owner: string;
  /** API Key 授权列表；会话用户传 null 表示不限制 */
  allowedIds?: string[] | null;
  tags?: string[];
  tagTerms?: string[];
  templateId?: string;
  state?: SandboxState;
  /** 匹配沙箱 ID、模板名称或模板镜像（不区分大小写） */
  keyword?: string;
};

function asState(value: string | null | undefined): SandboxState {
  const parsed = SandboxStateSchema.safeParse(value);
  return parsed.success ? parsed.data : "error";
}

function toRecord(row: RecordRow): SandboxRecordDoc {
  return {
    sandboxId: row.sandboxId,
    owner: row.owner,
    templateId: row.templateId,
    regionId: row.regionId || "gzg",
    tags: row.tags ?? [],
    state: asState(row.state),
    autoShutdown: !!row.autoShutdown,
    idleMinutes:
      typeof row.idleMinutes === "number" && row.idleMinutes >= 5
        ? row.idleMinutes
        : DEFAULT_IDLE_CONFIG.idleMinutes,
    inflight:
      typeof row.inflight === "number" && row.inflight >= 0 ? row.inflight : 0,
    lastActivityAt: row.lastActivityAt,
    createdAt: row.createdAt,
  };
}

export async function saveSandboxRecord(
  owner: string,
  sandboxId: string,
  templateId: string,
  opts?: { idle?: IdleConfig; state?: SandboxState; regionId?: string }
): Promise<void> {
  const config = opts?.idle ?? DEFAULT_IDLE_CONFIG;
  const state = opts?.state ?? "starting";
  await prisma.sandboxRecord.create({
    data: {
      sandboxId,
      owner,
      templateId,
      regionId: opts?.regionId ?? "gzg",
      state,
      autoShutdown: config.autoShutdown,
      idleMinutes: config.idleMinutes,
    },
  });
}

export async function setSandboxState(
  sandboxId: string,
  state: SandboxState
): Promise<void> {
  await prisma.sandboxRecord.updateMany({
    where: { sandboxId },
    data: { state },
  });
}

/**
 * 按 Sealos 返回的状态批量写回。
 * 空列表不写（避免接口异常时把全部打成 error）；
 * 非空时：对齐已有项，库里有而 Sealos 没有的标为 error。
 * 传入 regionId 时只影响该区域的记录（多区域同步）。
 */
export async function syncSandboxStates(
  states: Map<string, SandboxState>,
  opts?: { regionId?: string },
): Promise<void> {
  if (states.size === 0) return;

  const ids = [...states.keys()];
  const regionFilter = opts?.regionId ? { regionId: opts.regionId } : {};
  await prisma.$transaction([
    ...ids.map((sandboxId) =>
      prisma.sandboxRecord.updateMany({
        where: {
          sandboxId,
          ...regionFilter,
          NOT: { state: states.get(sandboxId)! },
        },
        data: { state: states.get(sandboxId)! },
      })
    ),
    prisma.sandboxRecord.updateMany({
      where: {
        ...regionFilter,
        sandboxId: { notIn: ids },
        NOT: { state: "error" },
      },
      data: { state: "error" },
    }),
  ]);
}

export async function deleteSandboxRecord(sandboxId: string): Promise<void> {
  await prisma.sandboxRecord.deleteMany({ where: { sandboxId } });
}

export async function getSandboxRecord(
  sandboxId: string
): Promise<SandboxRecordDoc | null> {
  const row = await prisma.sandboxRecord.findUnique({ where: { sandboxId } });
  return row ? toRecord(row) : null;
}

export async function findSandboxRecords(
  sandboxIds: string[]
): Promise<Map<string, SandboxRecordDoc>> {
  if (sandboxIds.length === 0) return new Map();
  const rows = await prisma.sandboxRecord.findMany({
    where: { sandboxId: { in: sandboxIds } },
  });
  return new Map(rows.map((row) => [row.sandboxId, toRecord(row)]));
}

/** 全部沙箱 ID → 所有者，供用量扫描对齐 Launchpad 列表。 */
export async function listSandboxOwners(): Promise<Map<string, string>> {
  const rows = await prisma.sandboxRecord.findMany({
    select: { sandboxId: true, owner: true },
  });
  return new Map(rows.map((row) => [row.sandboxId, row.owner]));
}

/** 列出当前用户在数据库中的沙箱记录（列表以 DB 为准） */
export async function listSandboxRecords(
  options: ListSandboxRecordsOptions
): Promise<SandboxRecordDoc[]> {
  const {
    owner,
    allowedIds = null,
    tags = [],
    tagTerms = [],
    templateId,
    state,
    keyword,
  } = options;

  const where: Prisma.SandboxRecordWhereInput = { owner };
  if (allowedIds) where.sandboxId = { in: allowedIds };
  if (templateId) where.templateId = templateId;
  if (state) where.state = state;
  if (tags.length > 0) where.tags = { hasEvery: tags };

  let rows = await prisma.sandboxRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  if (tagTerms.length > 0) {
    rows = rows.filter((row) =>
      tagTerms.every((term) =>
        (row.tags ?? []).some((tag) => tag.includes(term))
      )
    );
  }

  if (keyword) {
    const kw = keyword.toLowerCase();
    const templateIds = [...new Set(rows.map((row) => row.templateId))];
    const templates =
      templateIds.length === 0
        ? []
        : await prisma.template.findMany({
            where: { id: { in: templateIds } },
            select: { id: true, name: true, image: true },
          });
    const byId = new Map(templates.map((t) => [t.id, t]));
    rows = rows.filter((row) => {
      if (row.sandboxId.toLowerCase().includes(kw)) return true;
      const template = byId.get(row.templateId);
      if (!template) return false;
      return (
        template.name.toLowerCase().includes(kw) ||
        template.image.toLowerCase().includes(kw)
      );
    });
  }

  return rows.map(toRecord);
}
