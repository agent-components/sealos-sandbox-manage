import { useCallback, useMemo } from 'react';
import { App, Button, Typography } from 'antd';
import {
  ListPage,
  useListPageContext,
  type FloatComponentProps,
} from 'listpage-components/ListPage';
import { HydratedProTable } from '@/components/list-page';
import { trpc } from '@/api/trpc';
import { callLogColumns } from './columns';
import { CallLogDetailDrawer } from './detail';
import { callLogFilters } from './filters';
import type { CallLogFilters, CallLogRow } from './types';

function CallLogTable() {
  const ctx = useListPageContext<CallLogRow, CallLogFilters>();
  return (
    <HydratedProTable
      columns={callLogColumns(ctx)}
      title="日志"
      widthKey="sandbox-call-logs-width"
      columnKey="sandbox-call-logs-columns"
      scroll={{ x: 1000, y: 'calc(100vh - 420px)' }}
    />
  );
}

export function CallLogListPage() {
  const { message } = App.useApp();

  const request = useCallback(
    async (
      page: { current: number; pageSize: number },
      filters: CallLogFilters,
    ) => {
      try {
        const range = filters.range;
        const res = await trpc.callLogs.list.query({
          current: page.current,
          pageSize: page.pageSize,
          ...(range?.[0] ? { from: range[0].toISOString() } : {}),
          ...(range?.[1] ? { to: range[1].toISOString() } : {}),
        });
        return { list: res.list, total: res.total };
      } catch (err) {
        message.error(err instanceof Error ? err.message : '加载失败');
        return { list: [], total: 0 };
      }
    },
    [message],
  );

  const filterItems = useMemo(() => callLogFilters(), []);
  const floats = useMemo(
    () => [
      {
        key: 'detail',
        render: ({ record, onClose }: FloatComponentProps<CallLogRow>) => (
          <CallLogDetailDrawer logId={record?.id ?? null} onClose={() => onClose()} />
        ),
      },
    ],
    [],
  );

  return (
    <ListPage<CallLogRow, CallLogFilters>
      title={
        <Typography.Title level={3} style={{ margin: 0 }}>
          调用日志
        </Typography.Title>
      }
      extra={(ctx) => (
        <Button onClick={() => ctx.refreshTable()}>刷新</Button>
      )}
      filter={{ items: filterItems }}
      table={{ render: () => <CallLogTable /> }}
      request={request}
      float={{ floats }}
      initialValues={{ pageSize: 20 }}
    />
  );
}