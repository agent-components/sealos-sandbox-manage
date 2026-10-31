import { prisma } from "@/lib/db/prisma";
import type { ApiKey } from "@/lib/apikey/schema";
import { isApiKeySecret, maskApiKeySecret } from "@/lib/apikey/secret";
import { Prisma } from "@prisma/client";

type ApiKeyRow = {
  id: string;
  name: string;
  username: string;
  key: string;
  sandboxIds: string[];
  allowedTools: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
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
    sandboxIds: row.sandboxIds ?? [],
    allowedTools: normalizeAllowedTools(row.allowedTools),
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export async function listApiKeys(username: string): Promise<ApiKey[]> {
  const rows = await prisma.apiKey.findMany({
    where: { username },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toApiKey);
}

export async function countApiKeys(username: string): Promise<number> {
  return prisma.apiKey.count({ where: { username } });
}

export async function apiKeyIdExists(id: string): Promise<boolean> {
  const row = await prisma.apiKey.findUnique({
    where: { id },
    select: { id: true },
  });
  return row != null;
}

export async function createApiKey(input: {
  id: string;
  name: string;
  username: string;
  key: string;
  sandboxIds: string[];
  allowedTools?: string[] | null;
}): Promise<ApiKey> {
  const allowedTools = normalizeAllowedTools(input.allowedTools) ?? [];
  const row = await prisma.apiKey.create({
    data: {
      id: input.id,
      name: input.name,
      username: input.username,
      key: input.key,
      sandboxIds: input.sandboxIds,
      allowedTools,
    },
  });
  return toApiKey(row);
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
  const data: Prisma.ApiKeyUpdateManyMutationInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.sandboxIds !== undefined) data.sandboxIds = patch.sandboxIds;
  if (patch.allowedTools !== undefined) {
    data.allowedTools = normalizeAllowedTools(patch.allowedTools) ?? [];
  }
  if (Object.keys(data).length === 0) return null;

  const result = await prisma.apiKey.updateMany({
    where: { id, username },
    data,
  });
  if (result.count === 0) return null;

  const row = await prisma.apiKey.findFirst({ where: { id, username } });
  return row ? toApiKey(row) : null;
}

/** 把沙箱加入指定 API Key 的授权列表。Key 不存在时返回 false。 */
export async function grantApiKeySandbox(
  id: string,
  username: string,
  sandboxId: string,
): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE sandbox.api_keys
    SET sandbox_ids = CASE
      WHEN ${sandboxId} = ANY(sandbox_ids) THEN sandbox_ids
      ELSE array_append(sandbox_ids, ${sandboxId})
    END
    WHERE id = ${id} AND username = ${username}`;
  return result > 0;
}

/** 沙箱删除后，从该用户全部 API Key 的授权列表中移除。 */
export async function revokeSandboxFromApiKeys(
  username: string,
  sandboxId: string,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE sandbox.api_keys
    SET sandbox_ids = array_remove(sandbox_ids, ${sandboxId})
    WHERE username = ${username}`;
}

/** 复制时取回这把 Key 的明文。只能读取当前用户自己的。 */
export async function getApiKeySecret(
  id: string,
  username: string,
): Promise<string | null> {
  const row = await prisma.apiKey.findFirst({
    where: { id, username },
    select: { key: true },
  });
  return row?.key ?? null;
}

export async function deleteApiKey(
  id: string,
  username: string,
): Promise<boolean> {
  const result = await prisma.apiKey.deleteMany({
    where: { id, username },
  });
  return result.count > 0;
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
  const row = await prisma.apiKey.findUnique({
    where: { key: secret },
    select: {
      id: true,
      name: true,
      username: true,
      sandboxIds: true,
      allowedTools: true,
      lastUsedAt: true,
    },
  });
  if (!row) return null;

  const now = Date.now();
  const stale =
    !row.lastUsedAt || now - row.lastUsedAt.getTime() > 60_000;
  if (stale) {
    await prisma.apiKey.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });
  }
  return {
    username: row.username,
    apiKeyId: row.id,
    apiKeyName: row.name,
    sandboxIds: row.sandboxIds ?? [],
    allowedTools: normalizeAllowedTools(row.allowedTools),
  };
}
