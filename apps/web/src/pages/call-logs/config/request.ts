import type { ListPageRequest } from 'listpage-components';
import { trpc } from '@/api/trpc';
import type { CallLogFilters } from '../types';

export const callLogRequest: ListPageRequest<CallLogFilters> = (
  page,
  filters,
) => {
  const range = filters.range;
  return trpc.callLogs.list
    .query({
      current: page.current,
      pageSize: page.pageSize,
      ...(range?.[0] ? { from: range[0].toISOString() } : {}),
      ...(range?.[1] ? { to: range[1].toISOString() } : {}),
    })
    .then((res) => ({ list: res.list, total: res.total }));
};