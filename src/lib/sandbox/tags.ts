import { prisma } from "@/lib/db/prisma";
import type { Sandbox } from "@/lib/sandbox/schema";

export async function setSandboxTags(
  owner: string,
  sandboxId: string,
  tags: string[]
): Promise<void> {
  await prisma.sandboxRecord.updateMany({
    where: { owner, sandboxId },
    data: { tags },
  });
}

export async function withSandboxTags(
  owner: string,
  sandboxes: Sandbox[]
): Promise<Sandbox[]> {
  if (sandboxes.length === 0) return sandboxes;
  const rows = await prisma.sandboxRecord.findMany({
    where: {
      owner,
      sandboxId: { in: sandboxes.map((sandbox) => sandbox.id) },
    },
    select: { sandboxId: true, tags: true },
  });
  const byId = new Map(rows.map((row) => [row.sandboxId, row.tags ?? []]));
  return sandboxes.map((sandbox) => ({
    ...sandbox,
    tags: byId.get(sandbox.id) ?? [],
  }));
}

/** 同时包含全部标签的沙箱 ID */
export async function findSandboxIdsByTags(
  owner: string,
  tags: string[]
): Promise<string[]> {
  if (tags.length === 0) return [];
  const rows = await prisma.sandboxRecord.findMany({
    where: { owner, tags: { hasEvery: tags } },
    select: { sandboxId: true },
  });
  return rows.map((row) => row.sandboxId);
}

/** 每个关键词都能在某个标签里找到的沙箱 ID */
export async function findSandboxIdsByTagQuery(
  owner: string,
  terms: string[]
): Promise<string[]> {
  if (terms.length === 0) return [];
  const rows = await prisma.sandboxRecord.findMany({
    where: { owner },
    select: { sandboxId: true, tags: true },
  });
  return rows
    .filter((row) =>
      terms.every((term) =>
        (row.tags ?? []).some((tag) => tag.includes(term))
      )
    )
    .map((row) => row.sandboxId);
}
