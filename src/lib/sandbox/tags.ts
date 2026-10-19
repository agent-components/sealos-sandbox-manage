import { query } from "@/lib/db/postgres";
import type { Sandbox } from "@/lib/sandbox/schema";

function tagKey(tag: string): string {
  return tag.toLocaleLowerCase();
}

export async function setSandboxTags(
  owner: string,
  sandboxId: string,
  tags: string[],
): Promise<void> {
  if (tags.length === 0) {
    await query(
      `DELETE FROM sandbox.tags WHERE owner = $1 AND sandbox_id = $2`,
      [owner, sandboxId],
    );
    return;
  }
  await query(
    `INSERT INTO sandbox.tags (owner, sandbox_id, tags, tags_key)
     VALUES ($1, $2, $3::text[], $4::text[])
     ON CONFLICT (owner, sandbox_id) DO UPDATE
     SET tags = EXCLUDED.tags,
         tags_key = EXCLUDED.tags_key,
         updated_at = now()`,
    [owner, sandboxId, tags, tags.map(tagKey)],
  );
}

export async function deleteSandboxTags(
  owner: string,
  sandboxId: string,
): Promise<void> {
  await query(
    `DELETE FROM sandbox.tags WHERE owner = $1 AND sandbox_id = $2`,
    [owner, sandboxId],
  );
}

export async function withSandboxTags(
  owner: string,
  sandboxes: Sandbox[],
): Promise<Sandbox[]> {
  if (sandboxes.length === 0) return sandboxes;
  const result = await query<{ sandbox_id: string; tags: string[] | null }>(
    `SELECT sandbox_id, tags
     FROM sandbox.tags
     WHERE owner = $1 AND sandbox_id = ANY($2::text[])`,
    [owner, sandboxes.map((sandbox) => sandbox.id)],
  );
  const byId = new Map(result.rows.map((row) => [row.sandbox_id, row.tags ?? []]));
  return sandboxes.map((sandbox) => ({
    ...sandbox,
    tags: byId.get(sandbox.id) ?? [],
  }));
}

/** 同时包含全部标签（不区分大小写）的沙箱 ID */
export async function findSandboxIdsByTags(
  owner: string,
  tags: string[],
): Promise<string[]> {
  if (tags.length === 0) return [];
  const result = await query<{ sandbox_id: string }>(
    `SELECT sandbox_id
     FROM sandbox.tags
     WHERE owner = $1 AND tags_key @> $2::text[]`,
    [owner, tags.map(tagKey)],
  );
  return result.rows.map((row) => row.sandbox_id);
}

/** 每个关键词都能在某个标签里找到（不区分大小写）的沙箱 ID */
export async function findSandboxIdsByTagQuery(
  owner: string,
  terms: string[],
): Promise<string[]> {
  if (terms.length === 0) return [];
  const result = await query<{ sandbox_id: string }>(
    `SELECT sandbox_id
     FROM sandbox.tags
     WHERE owner = $1
       AND NOT EXISTS (
         SELECT 1
         FROM unnest($2::text[]) AS term
         WHERE NOT EXISTS (
           SELECT 1
           FROM unnest(tags_key) AS tag
           WHERE strpos(tag, term) > 0
         )
       )`,
    [owner, terms.map(tagKey)],
  );
  return result.rows.map((row) => row.sandbox_id);
}
