/** ListPage 分页：页码从 1 开始，响应为 `{ list, total }`。 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type PageParams = {
  current: number;
  /** 未传 pageSize / limit 时为 null，表示返回全部匹配结果。 */
  pageSize: number | null;
};

export type PageResult<T> = {
  list: T[];
  total: number;
};

function positiveInt(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
}

/**
 * 读取 `current`（别名 `page`）和 `pageSize`（别名 `limit`）。
 * 未传每页条数时 `pageSize` 为 `defaultPageSize`（默认 null，即不分页）。
 */
export function parsePageQuery(
  searchParams: URLSearchParams,
  options?: { defaultPageSize?: number | null; maxPageSize?: number },
): PageParams {
  const maxPageSize = options?.maxPageSize ?? MAX_PAGE_SIZE;
  const defaultPageSize =
    options?.defaultPageSize === undefined ? null : options.defaultPageSize;

  const currentRaw = positiveInt(
    searchParams.get("current") ?? searchParams.get("page"),
  );
  const current = currentRaw == null ? 1 : Math.max(1, currentRaw);

  const sizeRaw = positiveInt(
    searchParams.get("pageSize") ?? searchParams.get("limit"),
  );
  if (sizeRaw == null) {
    return {
      current,
      pageSize:
        defaultPageSize == null
          ? null
          : Math.min(maxPageSize, Math.max(1, defaultPageSize)),
    };
  }
  return {
    current,
    pageSize: Math.min(maxPageSize, Math.max(1, sizeRaw)),
  };
}

export function slicePage<T>(items: T[], page: PageParams): PageResult<T> {
  const total = items.length;
  if (page.pageSize == null) return { list: items, total };
  const start = (page.current - 1) * page.pageSize;
  return { list: items.slice(start, start + page.pageSize), total };
}
