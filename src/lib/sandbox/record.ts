import { query } from "@/lib/db/postgres";
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
  tags: string[];
  state: SandboxState;
  autoShutdown: boolean;
  idleMinutes: number;
  createdAt: Date;
};

type RecordRow = {
  sandbox_id: string;
  owner: string;
  template_id: string;
  tags: string[] | null;
  state: string;
  auto_shutdown: boolean;
  idle_minutes: number;
  created_at: Date;
};

const RECORD_COLUMNS = `sandbox_id, owner, template_id, tags, state,
  auto_shutdown, idle_minutes, created_at`;

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
    sandboxId: row.sandbox_id,
    owner: row.owner,
    templateId: row.template_id,
    tags: row.tags ?? [],
    state: asState(row.state),
    autoShutdown: !!row.auto_shutdown,
    idleMinutes:
      typeof row.idle_minutes === "number" && row.idle_minutes >= 5
        ? row.idle_minutes
        : DEFAULT_IDLE_CONFIG.idleMinutes,
    createdAt: row.created_at,
  };
}

export async function saveSandboxRecord(
  owner: string,
  sandboxId: string,
  templateId: string,
  opts?: { idle?: IdleConfig; state?: SandboxState }
): Promise<void> {
  const config = opts?.idle ?? DEFAULT_IDLE_CONFIG;
  const state = opts?.state ?? "starting";
  await query(
    `INSERT INTO sandbox.records (
       sandbox_id, owner, template_id, state, auto_shutdown, idle_minutes
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      sandboxId,
      owner,
      templateId,
      state,
      config.autoShutdown,
      config.idleMinutes,
    ]
  );
}

export async function setSandboxState(
  sandboxId: string,
  state: SandboxState
): Promise<void> {
  await query(
    `UPDATE sandbox.records
     SET state = $2, updated_at = now()
     WHERE sandbox_id = $1`,
    [sandboxId, state]
  );
}

/**
 * 按 Sealos 返回的状态批量写回。
 * 空列表不写（避免接口异常时把全部打成 error）；
 * 非空时：对齐已有项，库里有而 Sealos 没有的标为 error。
 */
export async function syncSandboxStates(
  states: Map<string, SandboxState>
): Promise<void> {
  if (states.size === 0) return;

  const ids = [...states.keys()];
  const values = ids.map((id) => states.get(id)!);
  await query(
    `UPDATE sandbox.records AS record
     SET state = data.state, updated_at = now()
     FROM unnest($1::text[], $2::text[]) AS data(sandbox_id, state)
     WHERE record.sandbox_id = data.sandbox_id
       AND record.state IS DISTINCT FROM data.state`,
    [ids, values]
  );
  await query(
    `UPDATE sandbox.records
     SET state = 'error', updated_at = now()
     WHERE NOT (sandbox_id = ANY($1::text[]))
       AND state IS DISTINCT FROM 'error'`,
    [ids]
  );
}

export async function deleteSandboxRecord(sandboxId: string): Promise<void> {
  await query(`DELETE FROM sandbox.records WHERE sandbox_id = $1`, [sandboxId]);
}

export async function getSandboxRecord(
  sandboxId: string
): Promise<SandboxRecordDoc | null> {
  const result = await query<RecordRow>(
    `SELECT ${RECORD_COLUMNS}
     FROM sandbox.records
     WHERE sandbox_id = $1`,
    [sandboxId]
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

export async function findSandboxRecords(
  sandboxIds: string[]
): Promise<Map<string, SandboxRecordDoc>> {
  if (sandboxIds.length === 0) return new Map();
  const result = await query<RecordRow>(
    `SELECT ${RECORD_COLUMNS}
     FROM sandbox.records
     WHERE sandbox_id = ANY($1::text[])`,
    [sandboxIds]
  );
  return new Map(result.rows.map((row) => [row.sandbox_id, toRecord(row)]));
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

  const conditions = ["r.owner = $1"];
  const params: unknown[] = [owner];
  let i = 2;

  if (allowedIds) {
    conditions.push(`r.sandbox_id = ANY($${i}::text[])`);
    params.push(allowedIds);
    i += 1;
  }
  if (templateId) {
    conditions.push(`r.template_id = $${i}`);
    params.push(templateId);
    i += 1;
  }
  if (state) {
    conditions.push(`r.state = $${i}`);
    params.push(state);
    i += 1;
  }
  if (tags.length > 0) {
    conditions.push(`r.tags @> $${i}::text[]`);
    params.push(tags);
    i += 1;
  }
  if (tagTerms.length > 0) {
    conditions.push(`NOT EXISTS (
      SELECT 1
      FROM unnest($${i}::text[]) AS term
      WHERE NOT EXISTS (
        SELECT 1
        FROM unnest(r.tags) AS tag
        WHERE strpos(tag, term) > 0
      )
    )`);
    params.push(tagTerms);
    i += 1;
  }
  if (keyword) {
    conditions.push(`(
      strpos(lower(r.sandbox_id), $${i}) > 0
      OR strpos(lower(coalesce(t.name, '')), $${i}) > 0
      OR strpos(lower(coalesce(t.image, '')), $${i}) > 0
    )`);
    params.push(keyword.toLowerCase());
    i += 1;
  }

  const result = await query<RecordRow>(
    `SELECT r.sandbox_id, r.owner, r.template_id, r.tags, r.state,
            r.auto_shutdown, r.idle_minutes, r.created_at
     FROM sandbox.records r
     LEFT JOIN sandbox.templates t ON t.id = r.template_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY r.created_at DESC`,
    params
  );
  return result.rows.map(toRecord);
}
