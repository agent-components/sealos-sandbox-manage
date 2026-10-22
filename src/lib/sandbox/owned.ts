import { listSandboxRecords } from "@/lib/sandbox/record";

export async function listOwnedSandboxIds(
  username: string
): Promise<Set<string>> {
  const records = await listSandboxRecords({ owner: username });
  return new Set(records.map((item) => item.sandboxId));
}

export async function findUnownedSandboxIds(
  username: string,
  sandboxIds: string[]
): Promise<string[]> {
  if (sandboxIds.length === 0) return [];
  const owned = await listOwnedSandboxIds(username);
  return sandboxIds.filter((id) => !owned.has(id));
}
