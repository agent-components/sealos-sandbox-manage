import { query } from "@/lib/db/postgres";

export type SandboxRecordDoc = {
  sandboxId: string;
  owner: string;
  templateId: string;
  createdAt: Date;
};

type RecordRow = {
  sandbox_id: string;
  owner: string;
  template_id: string;
  created_at: Date;
};

function toRecord(row: RecordRow): SandboxRecordDoc {
  return {
    sandboxId: row.sandbox_id,
    owner: row.owner,
    templateId: row.template_id,
    createdAt: row.created_at,
  };
}

export async function saveSandboxRecord(
  owner: string,
  sandboxId: string,
  templateId: string,
): Promise<void> {
  await query(
    `INSERT INTO sandbox.records (sandbox_id, owner, template_id)
     VALUES ($1, $2, $3)`,
    [sandboxId, owner, templateId],
  );
}

export async function deleteSandboxRecord(sandboxId: string): Promise<void> {
  await query(`DELETE FROM sandbox.records WHERE sandbox_id = $1`, [sandboxId]);
}

export async function getSandboxRecord(
  sandboxId: string,
): Promise<SandboxRecordDoc | null> {
  const result = await query<RecordRow>(
    `SELECT sandbox_id, owner, template_id, created_at
     FROM sandbox.records
     WHERE sandbox_id = $1`,
    [sandboxId],
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

export async function findSandboxRecords(
  sandboxIds: string[],
): Promise<Map<string, SandboxRecordDoc>> {
  if (sandboxIds.length === 0) return new Map();
  const result = await query<RecordRow>(
    `SELECT sandbox_id, owner, template_id, created_at
     FROM sandbox.records
     WHERE sandbox_id = ANY($1::text[])`,
    [sandboxIds],
  );
  return new Map(result.rows.map((row) => [row.sandbox_id, toRecord(row)]));
}
