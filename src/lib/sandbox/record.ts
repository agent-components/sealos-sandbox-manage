import { query } from "@/lib/db/postgres";

export type SandboxRecordDoc = {
  sandboxId: string;
  owner: string;
  templateId: string;
  tags: string[];
  createdAt: Date;
};

type RecordRow = {
  sandbox_id: string;
  owner: string;
  template_id: string;
  tags: string[] | null;
  created_at: Date;
};

export type ListSandboxRecordsOptions = {
  owner: string;
  /** API Key 授权列表；会话用户传 null 表示不限制 */
  allowedIds?: string[] | null;
  tags?: string[];
  tagTerms?: string[];
  templateId?: string;
  /** 匹配沙箱 ID、模板名称或模板镜像（不区分大小写） */
  keyword?: string;
};

function toRecord(row: RecordRow): SandboxRecordDoc {
  return {
    sandboxId: row.sandbox_id,
    owner: row.owner,
    templateId: row.template_id,
    tags: row.tags ?? [],
    createdAt: row.created_at,
  };
}

export async function saveSandboxRecord(
  owner: string,
  sandboxId: string,
  templateId: string
): Promise<void> {
  await query(
    `INSERT INTO sandbox.records (sandbox_id, owner, template_id)
     VALUES ($1, $2, $3)`,
    [sandboxId, owner, templateId]
  );
}

export async function deleteSandboxRecord(sandboxId: string): Promise<void> {
  await query(`DELETE FROM sandbox.records WHERE sandbox_id = $1`, [sandboxId]);
}

export async function getSandboxRecord(
  sandboxId: string
): Promise<SandboxRecordDoc | null> {
  const result = await query<RecordRow>(
    `SELECT sandbox_id, owner, template_id, tags, created_at
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
    `SELECT sandbox_id, owner, template_id, tags, created_at
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
    `SELECT r.sandbox_id, r.owner, r.template_id, r.tags, r.created_at
     FROM sandbox.records r
     LEFT JOIN sandbox.templates t ON t.id = r.template_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY r.created_at DESC`,
    params
  );
  return result.rows.map(toRecord);
}
