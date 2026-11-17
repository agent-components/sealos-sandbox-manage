import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AuthError } from "@/lib/sealos/errors";
import { assignStorageNames } from "@/lib/sealos/storage-name";
import { createTemplateId } from "@/lib/template/id";
import type {
  Template,
  TemplateConfigMap,
  TemplateEnv,
  TemplatePort,
  TemplateStorage,
} from "@/lib/template/schema";

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  image: string;
  imageRegistry: Prisma.JsonValue | null;
  launchCommand: Prisma.JsonValue | null;
  cpu: number;
  memoryGi: number;
  replicas: number;
  autoShutdown: boolean;
  idleMinutes: number;
  ports: Prisma.JsonValue;
  env: Prisma.JsonValue;
  storage: Prisma.JsonValue;
  configMap: Prisma.JsonValue;
  owner: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function asJsonArray<T>(value: Prisma.JsonValue | null | undefined): T[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value as T[];
  return [];
}

function toTemplate(row: TemplateRow): Template {
  const ports = asJsonArray<TemplatePort>(row.ports);
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    icon: row.icon,
    image: row.image,
    imageRegistry: (row.imageRegistry as Template["imageRegistry"]) ?? null,
    launchCommand: (row.launchCommand as Template["launchCommand"]) ?? undefined,
    cpu: row.cpu,
    memoryGi: row.memoryGi,
    replicas: row.replicas ?? 1,
    autoShutdown: row.autoShutdown ?? false,
    idleMinutes:
      typeof row.idleMinutes === "number" && row.idleMinutes >= 5
        ? row.idleMinutes
        : 5,
    ports: ports.length
      ? ports
      : [{ number: 80, protocol: "http", isPublic: true }],
    env: asJsonArray<TemplateEnv>(row.env),
    storage: assignStorageNames(asJsonArray<TemplateStorage>(row.storage)),
    configMap: asJsonArray<TemplateConfigMap>(row.configMap),
    owner: row.owner ?? "",
    isPublic: row.isPublic ?? false,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** 自己的模板，以及所有公共模板。 */
export function templateReadableBy(
  template: { owner?: string; isPublic?: boolean },
  username: string,
) {
  return template.isPublic === true || template.owner === username;
}

export async function listTemplates(viewer: string): Promise<Template[]> {
  const page = await listTemplatesPage({ viewer });
  return page.list;
}

export async function listTemplatesPage(opts?: {
  viewer?: string;
  q?: string;
  isPublic?: boolean;
  current?: number;
  pageSize?: number | null;
}): Promise<{ list: Template[]; total: number }> {
  const keyword = opts?.q?.trim();
  const access: Prisma.TemplateWhereInput = opts?.viewer
    ? { OR: [{ isPublic: true }, { owner: opts.viewer }] }
    : {};
  const parts: Prisma.TemplateWhereInput[] = [access];
  if (keyword) {
    parts.push({
      OR: [
        { id: { contains: keyword, mode: "insensitive" } },
        { name: { contains: keyword, mode: "insensitive" } },
        { image: { contains: keyword, mode: "insensitive" } },
      ],
    });
  }
  if (opts?.isPublic !== undefined) {
    parts.push({ isPublic: opts.isPublic });
  }
  const where: Prisma.TemplateWhereInput =
    parts.length === 1 ? parts[0]! : { AND: parts };

  const total = await prisma.template.count({ where });
  const rows = await prisma.template.findMany({
    where,
    orderBy: { createdAt: "asc" },
    ...(opts?.pageSize != null
      ? {
          take: opts.pageSize,
          skip: (Math.max(opts.current ?? 1, 1) - 1) * opts.pageSize,
        }
      : {}),
  });
  const counts = rows.length
    ? await prisma.sandboxRecord.groupBy({
        by: ["templateId"],
        where: { templateId: { in: rows.map((row) => row.id) } },
        _count: { _all: true },
      })
    : [];
  const countById = new Map(
    counts.map((item) => [item.templateId, item._count._all]),
  );
  const owners = [...new Set(rows.map((row) => row.owner).filter(Boolean))];
  const people = owners.length
    ? await prisma.$queryRaw<{ account: string; displayName: string | null }[]>`
        SELECT account, "displayName"
        FROM public.users
        WHERE account IN (${Prisma.join(owners)})`
    : [];
  const nameByAccount = new Map(
    people.map((person) => [
      person.account,
      person.displayName?.trim() || person.account,
    ]),
  );
  return {
    list: rows.map((row) => ({
      ...toTemplate(row),
      sandboxCount: countById.get(row.id) ?? 0,
      ownerName: nameByAccount.get(row.owner) || row.owner || undefined,
    })),
    total,
  };
}

export async function getTemplate(id: string): Promise<Template | null> {
  const row = await prisma.template.findUnique({ where: { id } });
  return row ? toTemplate(row) : null;
}

export async function getVisibleTemplate(
  id: string,
  viewer: string,
): Promise<Template | null> {
  const template = await getTemplate(id);
  if (!template || !templateReadableBy(template, viewer)) return null;
  return template;
}

export async function createTemplate(
  input: Omit<Template, "createdAt" | "updatedAt">,
): Promise<Template> {
  const row = await prisma.template.create({
    data: {
      id: input.id,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      image: input.image,
      imageRegistry: input.imageRegistry
        ? toJson(input.imageRegistry)
        : Prisma.JsonNull,
      launchCommand: input.launchCommand
        ? toJson(input.launchCommand)
        : Prisma.JsonNull,
      cpu: input.cpu,
      memoryGi: input.memoryGi,
      replicas: input.replicas ?? 1,
      autoShutdown: input.autoShutdown ?? false,
      idleMinutes: input.idleMinutes ?? 5,
      ports: toJson(input.ports),
      env: toJson(input.env ?? []),
      storage: toJson(input.storage ?? []),
      configMap: toJson(input.configMap ?? []),
      owner: input.owner ?? "",
      isPublic: input.isPublic ?? false,
    },
  });
  return toTemplate(row);
}

export async function updateTemplate(
  id: string,
  patch: Partial<Omit<Template, "id" | "createdAt" | "updatedAt">>,
): Promise<Template | null> {
  const data: Prisma.TemplateUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.icon !== undefined) data.icon = patch.icon;
  if (patch.image !== undefined) data.image = patch.image;
  if (patch.imageRegistry !== undefined) {
    data.imageRegistry =
      patch.imageRegistry == null ? Prisma.JsonNull : toJson(patch.imageRegistry);
  }
  if (patch.launchCommand !== undefined) {
    data.launchCommand =
      patch.launchCommand == null ? Prisma.JsonNull : toJson(patch.launchCommand);
  }
  if (patch.cpu !== undefined) data.cpu = patch.cpu;
  if (patch.memoryGi !== undefined) data.memoryGi = patch.memoryGi;
  if (patch.replicas !== undefined) data.replicas = patch.replicas;
  if (patch.autoShutdown !== undefined) data.autoShutdown = patch.autoShutdown;
  if (patch.idleMinutes !== undefined) data.idleMinutes = patch.idleMinutes;
  if (patch.ports !== undefined) data.ports = toJson(patch.ports);
  if (patch.env !== undefined) data.env = toJson(patch.env);
  if (patch.storage !== undefined) data.storage = toJson(patch.storage);
  if (patch.configMap !== undefined) data.configMap = toJson(patch.configMap);
  if (patch.isPublic === true) {
    const current = await prisma.template.findUnique({ where: { id } });
    if (current && !current.isPublic) {
      throw new AuthError("公开模板会复制一份新模板，请使用公开操作", 400);
    }
  }
  if (patch.isPublic === false) {
    const current = await prisma.template.findUnique({ where: { id } });
    if (current?.isPublic) {
      throw new AuthError("公开模板不能改为私有", 400);
    }
  }

  if (Object.keys(data).length === 0) {
    const existing = await prisma.template.findUnique({ where: { id } });
    return existing ? toTemplate(existing) : null;
  }

  try {
    const row = await prisma.template.update({ where: { id }, data });
    return toTemplate(row);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return null;
    }
    throw error;
  }
}

/** 私有模板公开：复制一条新的公共模板，原模板保持私有。 */
export async function publishTemplate(
  id: string,
  owner: string,
): Promise<Template> {
  const current = await getTemplate(id);
  if (!current) throw new AuthError("模板不存在", 404);
  if (current.owner !== owner) {
    throw new AuthError("只有创建人可以公开模板", 403);
  }
  if (current.isPublic) throw new AuthError("模板已经是公开的", 400);
  return createTemplate({
    ...current,
    id: createTemplateId(),
    owner,
    isPublic: true,
    sandboxCount: undefined,
  });
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const result = await prisma.template.deleteMany({ where: { id } });
  return result.count > 0;
}
