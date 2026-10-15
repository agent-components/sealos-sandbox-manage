import type { Document } from "mongodb";
import { getCollection } from "@/lib/db/mongo";
import type { Sandbox } from "@/lib/sandbox/schema";

type SandboxTagDoc = Document & {
  sandboxId: string;
  owner: string;
  tags: string[];
  /** 小写后的标签，用于不区分大小写的检索 */
  tagsKey: string[];
  updatedAt: Date;
};

async function tagCollection() {
  const col = await getCollection<SandboxTagDoc>("sandbox_tags");
  await col.createIndex({ owner: 1, sandboxId: 1 }, { unique: true });
  await col.createIndex({ owner: 1, tagsKey: 1 });
  return col;
}

function tagKey(tag: string): string {
  return tag.toLocaleLowerCase();
}

export async function setSandboxTags(
  owner: string,
  sandboxId: string,
  tags: string[],
): Promise<void> {
  const col = await tagCollection();
  if (tags.length === 0) {
    await col.deleteOne({ owner, sandboxId });
    return;
  }
  await col.updateOne(
    { owner, sandboxId },
    {
      $set: {
        tags,
        tagsKey: tags.map(tagKey),
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export async function deleteSandboxTags(
  owner: string,
  sandboxId: string,
): Promise<void> {
  const col = await tagCollection();
  await col.deleteOne({ owner, sandboxId });
}

export async function withSandboxTags(
  owner: string,
  sandboxes: Sandbox[],
): Promise<Sandbox[]> {
  if (sandboxes.length === 0) return sandboxes;
  const col = await tagCollection();
  const docs = await col
    .find({
      owner,
      sandboxId: { $in: sandboxes.map((sandbox) => sandbox.id) },
    })
    .toArray();
  const byId = new Map(docs.map((doc) => [doc.sandboxId, doc.tags]));
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
  const col = await tagCollection();
  const docs = await col
    .find({ owner, tagsKey: { $all: tags.map(tagKey) } })
    .project<{ sandboxId: string }>({ sandboxId: 1 })
    .toArray();
  return docs.map((doc) => doc.sandboxId);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 每个关键词都能在某个标签里找到（不区分大小写）的沙箱 ID */
export async function findSandboxIdsByTagQuery(
  owner: string,
  terms: string[],
): Promise<string[]> {
  if (terms.length === 0) return [];
  const col = await tagCollection();
  const docs = await col
    .find({
      owner,
      tagsKey: {
        $all: terms.map(
          (term) => new RegExp(escapeRegExp(tagKey(term)), "i"),
        ),
      },
    })
    .project<{ sandboxId: string }>({ sandboxId: 1 })
    .toArray();
  return docs.map((doc) => doc.sandboxId);
}
