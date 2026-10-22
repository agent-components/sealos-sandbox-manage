"use client";

import {
  useListPageContext,
  type ListPageColumnType,
} from "listpage-components/ListPage";
import { HydratedProTable } from "@/components/list-page";
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
    <HydratedProTable
      columns={columns}
      widthKey="sandbox-sandboxes-width"
      columnKey="sandbox-sandboxes-columns"
      scroll={{ x: 1450 }}
      loadingWhenEmpty
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
