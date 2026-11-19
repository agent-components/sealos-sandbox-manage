import type { ListPageRequest } from 'listpage-components';
import { trpc } from '@/api/trpc';
import type { TemplateFilters } from './filters';

export const templateRequest: ListPageRequest<TemplateFilters> = (
  page,
  filters,
) =>
  trpc.templates.list
    .query({
      current: page.current,
      pageSize: page.pageSize,
      ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
      ...(filters.visibility === 'public'
        ? { isPublic: true }
        : filters.visibility === 'private'
          ? { isPublic: false }
          : {}),
    })
    .then((res) => ({ list: res.list, total: res.total }));