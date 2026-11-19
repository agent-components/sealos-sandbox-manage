import { Button, Tag, Typography } from 'antd';
import type {
  ListPageColumnType,
  ListPageContextValue,
} from 'listpage-components/ListPage';
import { operationLabel } from '@/lib/operations';
import {
  formatDuration,
  formatTime,
  sandboxIdOf,
  type CallLogFilters,
  type CallLogRow,
} from './types';

export function callLogColumns(
  ctx: ListPageContextValue<CallLogRow, CallLogFilters>,
): ListPageColumnType<CallLogRow, CallLogFilters>[] {
  return [
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 170,
      render: (value: string, row) =>
        formatTime(value || row.completedAt || row.createdAt),
    },
    {
      title: '耗时',
      dataIndex: 'durationMs',
      key: 'durationMs',
      width: 88,
      render: (value: number) => formatDuration(value),
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      width: 120,
      ellipsis: true,
      render: (value: string | undefined) =>
        value ? (
          <Typography.Text style={{ fontSize: 13 }}>{value}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: '操作',
      dataIndex: 'operation',
      key: 'operation',
      width: 150,
      render: (value: string) => (
        <Typography.Text code style={{ fontSize: 12 }}>
          {operationLabel(value)}
        </Typography.Text>
      ),
    },
    {
      title: '沙箱',
      key: 'sandbox',
      ellipsis: true,
      render: (_, row) => {
        const id = sandboxIdOf(row.arguments);
        if (!id) return <Typography.Text type="secondary">—</Typography.Text>;
        return (
          <Typography.Text
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
            ellipsis={{ tooltip: id }}
          >
            {id}
          </Typography.Text>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 88,
      render: (status: number, row) => (
        <Tag color={row.ok ? 'success' : 'error'}>{status}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 72,
      render: (_: unknown, record) => (
        <Button type="link" size="small" onClick={() => ctx.showFloat('detail', record)}>
          详情
        </Button>
      ),
    },
  ];
}
