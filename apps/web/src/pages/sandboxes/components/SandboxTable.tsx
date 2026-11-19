import { useMemo } from 'react';
import { useListPageContext } from 'listpage-components';
import { Space } from 'antd';
import { HydratedProTable } from '@/components/list-page';
import type { Sandbox } from '@/modules/sandbox/schema';
import { createSandboxColumns } from '../config/columns';
import type { SandboxFilters } from '../config/filters';
import { BatchStopButton } from './batch-stop';
import { BatchUpdateButton } from './batch-update';

export function SandboxTable() {
  const ctx = useListPageContext<Sandbox, SandboxFilters>();
  const columns = useMemo(() => createSandboxColumns(), []);
  const filtering = Boolean(
    ctx.filters.q?.trim() ||
    ctx.filters.tag?.trim() ||
    ctx.filters.state ||
    ctx.filters.templateId,
  );
  return (
    <HydratedProTable
      columns={columns}
      widthKey="sandbox-sandboxes-width"
      columnKey="sandbox-sandboxes-columns-v6"
      scroll={{ x: 1298 }}
      loadingWhenEmpty
      selectable
      toolbar={(selection) => (
        <Space size={8}>
          <BatchStopButton
            rows={selection.selectedRows}
            onDone={() => {
              selection.clearSelection();
              ctx.refreshTable();
            }}
          />
          <BatchUpdateButton
            rows={selection.selectedRows}
            onDone={() => {
              selection.clearSelection();
              ctx.refreshTable();
            }}
          />
        </Space>
      )}
      tableProps={{
        locale: {
          emptyText: ctx.loading
            ? '加载中…'
            : filtering
              ? '没有匹配的沙箱'
              : '还没有沙箱',
        },
      }}
    />
  );
}