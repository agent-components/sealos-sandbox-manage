import { query } from "@/lib/db/postgres";
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
  image_registry: Template["imageRegistry"] | null;
  launch_command: Template["launchCommand"] | null;
  cpu: number;
  memory_gi: number;
  replicas: number;
  auto_shutdown: boolean;
  idle_minutes: number;
  ports: TemplatePort[] | null;
  env: TemplateEnv[] | null;
  storage: TemplateStorage[] | null;
  config_map: TemplateConfigMap[] | null;
  created_at: Date;
  updated_at: Date;
};

const SELECT_COLUMNS = `id, name, description, image, image_registry, launch_command,
  cpu, memory_gi, replicas, auto_shutdown, idle_minutes,
  ports, env, storage, config_map, created_at, updated_at`;

function toTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    image: row.image,
    imageRegistry: row.image_registry ?? null,
    launchCommand: row.launch_command ?? undefined,
    cpu: row.cpu,
    memoryGi: row.memory_gi,
    replicas: row.replicas ?? 1,
    autoShutdown: row.auto_shutdown ?? false,
    idleMinutes:
      typeof row.idle_minutes === "number" && row.idle_minutes >= 5
        ? row.idle_minutes
        : 5,
    ports: row.ports?.length
      ? row.ports
      : [{ number: 80, protocol: "http", isPublic: true }],
    env: row.env ?? [],
    storage: row.storage ?? [],
    configMap: row.config_map ?? [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function jsonb(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function containsPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
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
  const where = keyword
    ? `WHERE id ILIKE $1 ESCAPE '\\' OR name ILIKE $1 ESCAPE '\\' OR image ILIKE $1 ESCAPE '\\'`
    : "";
  const params: unknown[] = keyword ? [containsPattern(keyword)] : [];
  const count = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM sandbox.templates ${where}`,
    params,
  );
  let sql = `SELECT ${SELECT_COLUMNS} FROM sandbox.templates ${where} ORDER BY created_at ASC`;
  if (opts?.pageSize != null) {
    const pageSize = opts.pageSize;
    const current = Math.max(opts.current ?? 1, 1);
    params.push(pageSize, (current - 1) * pageSize);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }
  const result = await query<TemplateRow>(sql, params);
  return {
    list: result.rows.map(toTemplate),
    total: Number(count.rows[0]?.count ?? 0),
  };
}

export async function getTemplate(id: string): Promise<Template | null> {
  const result = await query<TemplateRow>(
    `SELECT ${SELECT_COLUMNS} FROM sandbox.templates WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? toTemplate(row) : null;
}

export async function createTemplate(
  input: Omit<Template, "createdAt" | "updatedAt">,
): Promise<Template> {
  const result = await query<TemplateRow>(
    `INSERT INTO sandbox.templates (
       id, name, description, image, image_registry, launch_command,
       cpu, memory_gi, replicas, auto_shutdown, idle_minutes,
       ports, env, storage, config_map
     )
     VALUES (
       $1, $2, $3, $4, $5::jsonb, $6::jsonb,
       $7, $8, $9, $10, $11,
       $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb
     )
     RETURNING ${SELECT_COLUMNS}`,
    [
      input.id,
      input.name,
      input.description ?? null,
      input.image,
      jsonb(input.imageRegistry ?? null),
      jsonb(input.launchCommand ?? null),
      input.cpu,
      input.memoryGi,
      input.replicas ?? 1,
      input.autoShutdown ?? false,
      input.idleMinutes ?? 5,
      JSON.stringify(input.ports),
      JSON.stringify(input.env ?? []),
      JSON.stringify(input.storage ?? []),
      JSON.stringify(input.configMap ?? []),
    ],
  );
  return toTemplate(result.rows[0]!);
}

const PATCH_COLUMNS: Record<string, { column: string; jsonb?: boolean }> = {
  name: { column: "name" },
  description: { column: "description" },
  image: { column: "image" },
  imageRegistry: { column: "image_registry", jsonb: true },
  launchCommand: { column: "launch_command", jsonb: true },
  cpu: { column: "cpu" },
  memoryGi: { column: "memory_gi" },
  replicas: { column: "replicas" },
  autoShutdown: { column: "auto_shutdown" },
  idleMinutes: { column: "idle_minutes" },
  ports: { column: "ports", jsonb: true },
  env: { column: "env", jsonb: true },
  storage: { column: "storage", jsonb: true },
  configMap: { column: "config_map", jsonb: true },
};

export async function updateTemplate(
  id: string,
  patch: Partial<Omit<Template, "id" | "createdAt" | "updatedAt">>,
): Promise<Template | null> {
  const sets = ["updated_at = now()"];
  const params: unknown[] = [];
  for (const [key, spec] of Object.entries(PATCH_COLUMNS)) {
    if (!(key in patch)) continue;
    const value = patch[key as keyof typeof patch];
    if (value === undefined) continue;
    params.push(spec.jsonb ? jsonb(value) : value);
    const cast = spec.jsonb ? "::jsonb" : "";
    sets.push(`${spec.column} = $${params.length}${cast}`);
  }
  params.push(id);
  const result = await query<TemplateRow>(
    `UPDATE sandbox.templates
     SET ${sets.join(", ")}
     WHERE id = $${params.length}
     RETURNING ${SELECT_COLUMNS}`,
    params,
  );
  const row = result.rows[0];
  return row ? toTemplate(row) : null;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM sandbox.templates WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
