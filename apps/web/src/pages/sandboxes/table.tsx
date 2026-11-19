import {
  useListPageContext,
  type ListPageColumnType,
} from "listpage-components/ListPage";
import { Space } from "antd";
import { HydratedProTable } from "@/components/list-page";
import type { Sandbox } from "@/lib/sandbox/schema";
import { BatchStopButton } from "./batch-stop";
import { BatchUpdateButton } from "./batch-update";
import type { SandboxFilters } from "./filters";

export function SandboxTable({
  columns,
}: {
  columns: ListPageColumnType<Sandbox, SandboxFilters>[];
}) {
  const ctx = useListPageContext<Sandbox, SandboxFilters>();
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
            ? "加载中…"
            : filtering
              ? "没有匹配的沙箱"
              : "还没有沙箱",
        },
      }}
    />
  );
}
