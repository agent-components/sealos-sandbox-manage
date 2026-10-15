import type { Document } from "mongodb";
import { getCollection } from "@/lib/db/mongo";
import type { ApiKey } from "@/lib/apikey/schema";
import { isApiKeySecret } from "@/lib/apikey/secret";

type ApiKeyDoc = Document & {
  id: string;
  name: string;
  username: string;
  key: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

function toApiKey(doc: ApiKeyDoc): ApiKey {
  return {
    id: doc.id,
    name: doc.name,
    key: doc.key,
    createdAt: doc.createdAt?.toISOString(),
    lastUsedAt: doc.lastUsedAt?.toISOString() ?? null,
  };
}

async function apiKeys() {
  const col = await getCollection<ApiKeyDoc>("apikeys");
  await col.createIndex({ id: 1 }, { unique: true });
  await col.createIndex({ key: 1 }, { unique: true });
  await col.createIndex({ username: 1 });
  return col;
}

export async function listApiKeys(username: string): Promise<ApiKey[]> {
  const col = await apiKeys();
  const docs = await col.find({ username }).sort({ createdAt: -1 }).toArray();
  return docs.map(toApiKey);
}

export async function countApiKeys(username: string): Promise<number> {
  const col = await apiKeys();
  return col.countDocuments({ username });
}

export async function apiKeyIdExists(id: string): Promise<boolean> {
  const col = await apiKeys();
  const doc = await col.findOne({ id }, { projection: { _id: 1 } });
  return !!doc;
}

export async function createApiKey(input: {
  id: string;
  name: string;
  username: string;
  key: string;
}): Promise<ApiKey> {
  const col = await apiKeys();
  const now = new Date();
  const doc: ApiKeyDoc = {
    id: input.id,
    name: input.name,
    username: input.username,
    key: input.key,
    createdAt: now,
    lastUsedAt: null,
  };
  await col.insertOne(doc);
  return toApiKey(doc);
}

export async function deleteApiKey(
  id: string,
  username: string,
): Promise<boolean> {
  const col = await apiKeys();
  const result = await col.deleteOne({ id, username });
  return result.deletedCount > 0;
}

/** 用明文密钥换取所属用户；命中后按分钟更新最近使用时间。 */
export async function authenticateApiKey(
  secret: string,
): Promise<{ username: string } | null> {
  if (!isApiKeySecret(secret)) return null;
  const col = await apiKeys();
  const doc = await col.findOne({ key: secret });
  if (!doc) return null;

  const now = new Date();
  const stale =
    !doc.lastUsedAt || now.getTime() - doc.lastUsedAt.getTime() > 60_000;
  if (stale) {
    await col.updateOne({ id: doc.id }, { $set: { lastUsedAt: now } });
  }
  return { username: doc.username };
}
