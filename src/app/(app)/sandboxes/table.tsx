"use client";

import { ProTable } from "listpage-components/ProTable";
import {
  useListPageContext,
  type ListPageColumnType,
} from "listpage-components/ListPage";
import { listPagination } from "@/components/list-page";
import type { Sandbox } from "@/lib/sandbox/schema";
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
    <ProTable<Sandbox, typeof ctx>
      columns={columns}
      columnContext={ctx}
      dataSource={ctx.dataSource}
      loading={ctx.loading && ctx.dataSource.length === 0}
      rowKey="id"
      density="compact"
      columnResize={{ persistenceKey: "sandbox-sandboxes-width" }}
      columnSetting={{ persistenceKey: "sandbox-sandboxes-columns" }}
      extra={(columnSetting) => columnSetting?.trigger ?? null}
      scroll={{ x: 1450 }}
      sort={{ ...ctx.sort, onChange: ctx.updateSort }}
      pagination={{
        current: ctx.pagination.current,
        pageSize: ctx.pagination.pageSize,
        total: ctx.pagination.total,
        ...listPagination,
        onChange: ctx.updatePagination,
      }}
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
