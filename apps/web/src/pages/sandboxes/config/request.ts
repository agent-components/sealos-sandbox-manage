import type { ListPageRequest } from 'listpage-components';
import { trpc } from '@/api/trpc';
import type { SandboxFilters } from './filters';

export const sandboxRequest: ListPageRequest<SandboxFilters> = (
  page,
  filters,
  sort,
) =>
  trpc.sandboxes.list
    .query({
      current: page.current,
      pageSize: page.pageSize,
      ...(filters.q?.trim() ? { keyword: filters.q.trim() } : {}),
      ...(filters.tag?.trim() ? { q: filters.tag.trim() } : {}),
      ...(filters.state ? { state: filters.state } : {}),
      ...(filters.templateId ? { templateId: filters.templateId } : {}),
      ...(sort?.field === 'lastActivityAt' && sort.order
        ? { sort: 'lastActivityAt', order: sort.order }
        : {}),
    })
    .then((res) => ({ list: res.list, total: res.total }));