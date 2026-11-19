/**
 * Sealos 按挂载路径生成卷名，与 Launchpad `mountPathToConfigMapKey` 一致。
 * `/home/workspace` → `vn-homevn-workspace`，`/data` → `vn-data`。
 */
export function sealosStorageName(path: string): string {
  const raw = path.trim();
  const withoutTrailingSlash = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  let result = withoutTrailingSlash
    .replace(/_/g, "-")
    .replace(/[/.]/g, "vn-")
    .toLowerCase();
  if (result.length > 63) result = result.slice(-63);
  return result;
}

/** 用挂载路径覆盖卷名。调用方传入的 name 不保留。 */
export function assignStorageNames<T extends { path: string; name?: string }>(
  storage: T[] | undefined,
): Array<Omit<T, "name"> & { name: string }> {
  return (storage ?? [])
    .filter((item) => item.path.trim())
    .map((item) => ({
      ...item,
      path: item.path.trim(),
      name: sealosStorageName(item.path),
    }));
}
