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
  await query(
    `UPDATE sandbox.records
     SET tags = $3::text[], tags_key = $4::text[]
     WHERE owner = $1 AND sandbox_id = $2`,
    [owner, sandboxId, tags, tags.map(tagKey)],
  );
}

export async function withSandboxTags(
  owner: string,
  sandboxes: Sandbox[],
): Promise<Sandbox[]> {
  if (sandboxes.length === 0) return sandboxes;
  const result = await query<{ sandbox_id: string; tags: string[] | null }>(
    `SELECT sandbox_id, tags
     FROM sandbox.records
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
     FROM sandbox.records
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
     FROM sandbox.records
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
