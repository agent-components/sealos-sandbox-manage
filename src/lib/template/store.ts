import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
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
    storage: asJsonArray<TemplateStorage>(row.storage),
    configMap: asJsonArray<TemplateConfigMap>(row.configMap),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function listTemplates(): Promise<Template[]> {
  const page = await listTemplatesPage();
  return page.list;
}

export async function listTemplatesPage(opts?: {
  q?: string;
  current?: number;
  pageSize?: number | null;
}): Promise<{ list: Template[]; total: number }> {
  const keyword = opts?.q?.trim();
  const where: Prisma.TemplateWhereInput = keyword
    ? {
        OR: [
          { id: { contains: keyword, mode: "insensitive" } },
          { name: { contains: keyword, mode: "insensitive" } },
          { image: { contains: keyword, mode: "insensitive" } },
        ],
      }
    : {};

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
  return {
    list: rows.map((row) => toTemplate(row)),
    total,
  };
}

export async function getTemplate(id: string): Promise<Template | null> {
  const row = await prisma.template.findUnique({ where: { id } });
  return row ? toTemplate(row) : null;
}

export async function createTemplate(
  input: Omit<Template, "createdAt" | "updatedAt">,
): Promise<Template> {
  const row = await prisma.template.create({
    data: {
      id: input.id,
      name: input.name,
      description: input.description ?? null,
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

export async function deleteTemplate(id: string): Promise<boolean> {
  const result = await prisma.template.deleteMany({ where: { id } });
  return result.count > 0;
}
