"use client";

import { useEffect, useState } from "react";
import type { TableProps } from "antd";
import {
  useListPageContext,
  type ListPageColumnType,
} from "listpage-components/ListPage";
import { ProTable } from "listpage-components/ProTable";

export const listPagination = {
  showSizeChanger: true,
  pageSizeOptions: [10, 20, 50],
  showTotal: (total: number) => `共 ${total} 条`,
};

/**
 * 列宽和列设置在首次渲染时读取 localStorage。
 * 服务端没有这份缓存，必须等水合完成后再挂载表格，否则列宽会对不上。
 */
export function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return <div style={{ minHeight: 360 }} />;
  return children;
}

export function HydratedProTable<
  R extends Record<PropertyKey, any>,
  F extends Record<PropertyKey, any>,
>({
  columns,
  title,
  widthKey,
  columnKey,
  scroll,
  tableProps,
  loadingWhenEmpty = false,
}: {
  columns: ListPageColumnType<R, F>[];
  title?: string;
  widthKey: string;
  columnKey: string;
  scroll?: TableProps<R>["scroll"];
  tableProps?: TableProps<R>;
  loadingWhenEmpty?: boolean;
}) {
  const ctx = useListPageContext<R, F>();
  return (
    <ClientOnly>
      <ProTable<R, typeof ctx>
        columns={columns}
        columnContext={ctx}
        dataSource={ctx.dataSource}
        loading={
          loadingWhenEmpty
            ? ctx.loading && ctx.dataSource.length === 0
            : ctx.loading
        }
        rowKey="id"
        density="compact"
        title={title}
        columnResize={{ persistenceKey: widthKey }}
        columnSetting={{ persistenceKey: columnKey }}
        extra={(columnSetting) => columnSetting?.trigger ?? null}
        scroll={scroll}
        sort={{ ...ctx.sort, onChange: ctx.updateSort }}
        pagination={{
          current: ctx.pagination.current,
          pageSize: ctx.pagination.pageSize,
          total: ctx.pagination.total,
          ...listPagination,
          onChange: ctx.updatePagination,
        }}
        tableProps={tableProps}
      />
    </ClientOnly>
  );
}

export function BindListRefresh({
  onReady,
}: {
  onReady: (refresh: () => void) => void;
}) {
  const { refreshTable } = useListPageContext();
  useEffect(() => {
    onReady(refreshTable);
  }, [onReady, refreshTable]);
  return null;
}

export function AutoRefreshList({ intervalMs }: { intervalMs: number }) {
  const { refreshTable } = useListPageContext();
  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshTable();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, refreshTable]);
  return null;
}
