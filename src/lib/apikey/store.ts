import { query } from "@/lib/db/postgres";
import type { ApiKey } from "@/lib/apikey/schema";
import { isApiKeySecret, maskApiKeySecret } from "@/lib/apikey/secret";

type ApiKeyRow = {
  id: string;
  name: string;
  username: string;
  key: string;
  sandbox_ids: string[] | null;
  allowed_tools: string[] | null;
  created_at: Date;
  last_used_at: Date | null;
};

function normalizeAllowedTools(tools: string[] | null | undefined): string[] | null {
  if (tools == null || tools.length === 0) return null;
  return [...new Set(tools)];
}

function toApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    name: row.name,
    key: maskApiKeySecret(row.key),
    sandboxIds: row.sandbox_ids ?? [],
    allowedTools: normalizeAllowedTools(row.allowed_tools),
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
  };
}

const API_KEY_COLUMNS =
  "id, name, username, key, sandbox_ids, allowed_tools, created_at, last_used_at";

export async function listApiKeys(username: string): Promise<ApiKey[]> {
  const result = await query<ApiKeyRow>(
    `SELECT ${API_KEY_COLUMNS}
     FROM sandbox.api_keys
     WHERE username = $1
     ORDER BY created_at DESC`,
    [username],
  );
  return result.rows.map(toApiKey);
}

export async function countApiKeys(username: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM sandbox.api_keys WHERE username = $1`,
    [username],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function apiKeyIdExists(id: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM sandbox.api_keys WHERE id = $1`,
    [id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function createApiKey(input: {
  id: string;
  name: string;
  username: string;
  key: string;
  sandboxIds: string[];
  allowedTools?: string[] | null;
}): Promise<ApiKey> {
  const allowedTools = normalizeAllowedTools(input.allowedTools);
  const result = await query<ApiKeyRow>(
    `INSERT INTO sandbox.api_keys (id, name, username, key, sandbox_ids, allowed_tools)
     VALUES ($1, $2, $3, $4, $5::text[], $6::text[])
     RETURNING ${API_KEY_COLUMNS}`,
    [
      input.id,
      input.name,
      input.username,
      input.key,
      input.sandboxIds,
      allowedTools,
    ],
  );
  return toApiKey(result.rows[0]!);
}

export async function updateApiKey(
  id: string,
  username: string,
  patch: {
    name?: string;
    sandboxIds?: string[];
    allowedTools?: string[] | null;
  },
): Promise<ApiKey | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
  }
  if (patch.sandboxIds !== undefined) {
    params.push(patch.sandboxIds);
    sets.push(`sandbox_ids = $${params.length}::text[]`);
  }
  if (patch.allowedTools !== undefined) {
    params.push(normalizeAllowedTools(patch.allowedTools));
    sets.push(`allowed_tools = $${params.length}::text[]`);
  }
  if (sets.length === 0) return null;
  params.push(id, username);
  const result = await query<ApiKeyRow>(
    `UPDATE sandbox.api_keys
     SET ${sets.join(", ")}
     WHERE id = $${params.length - 1} AND username = $${params.length}
     RETURNING ${API_KEY_COLUMNS}`,
    params,
  );
  const row = result.rows[0];
  return row ? toApiKey(row) : null;
}

/** 把沙箱加入指定 API Key 的授权列表。Key 不存在时返回 false。 */
export async function grantApiKeySandbox(
  id: string,
  username: string,
  sandboxId: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE sandbox.api_keys
     SET sandbox_ids = CASE
       WHEN $3 = ANY(sandbox_ids) THEN sandbox_ids
       ELSE array_append(sandbox_ids, $3)
     END
     WHERE id = $1 AND username = $2`,
    [id, username, sandboxId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** 沙箱删除后，从该用户全部 API Key 的授权列表中移除。 */
export async function revokeSandboxFromApiKeys(
  username: string,
  sandboxId: string,
): Promise<void> {
  await query(
    `UPDATE sandbox.api_keys
     SET sandbox_ids = array_remove(sandbox_ids, $2)
     WHERE username = $1`,
    [username, sandboxId],
  );
}

/** 复制时取回这把 Key 的明文。只能读取当前用户自己的。 */
export async function getApiKeySecret(
  id: string,
  username: string,
): Promise<string | null> {
  const result = await query<{ key: string }>(
    `SELECT key FROM sandbox.api_keys WHERE id = $1 AND username = $2`,
    [id, username],
  );
  return result.rows[0]?.key ?? null;
}

export async function deleteApiKey(
  id: string,
  username: string,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM sandbox.api_keys WHERE id = $1 AND username = $2`,
    [id, username],
  );
  return (result.rowCount ?? 0) > 0;
}

/** 用明文密钥换取所属用户与授权沙箱；命中后按分钟更新最近使用时间。 */
export async function authenticateApiKey(secret: string): Promise<{
  username: string;
  apiKeyId: string;
  apiKeyName: string;
  sandboxIds: string[];
  allowedTools: string[] | null;
} | null> {
  if (!isApiKeySecret(secret)) return null;
  const result = await query<{
    id: string;
    name: string;
    username: string;
    sandbox_ids: string[] | null;
    allowed_tools: string[] | null;
    last_used_at: Date | null;
  }>(
    `SELECT id, name, username, sandbox_ids, allowed_tools, last_used_at
     FROM sandbox.api_keys
     WHERE key = $1`,
    [secret],
  );
  const row = result.rows[0];
  if (!row) return null;

  const now = Date.now();
  const stale =
    !row.last_used_at || now - row.last_used_at.getTime() > 60_000;
  if (stale) {
    await query(
      `UPDATE sandbox.api_keys SET last_used_at = now() WHERE id = $1`,
      [row.id],
    );
  }
  return {
    username: row.username,
    apiKeyId: row.id,
    apiKeyName: row.name,
    sandboxIds: row.sandbox_ids ?? [],
    allowedTools: normalizeAllowedTools(row.allowed_tools),
  };
}
