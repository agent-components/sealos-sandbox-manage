"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
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

function readHeight(root: ParentNode, selector: string, fallback: number) {
  const el = root.querySelector(selector);
  const height = el?.getBoundingClientRect().height ?? 0;
  return height > 0 ? height : fallback;
}

/**
 * 只设 scroll.x 时，表格会把 overflow-y 设成 hidden，滚轮到不了页面底部。
 * 按表头、工具栏和分页的实际高度，把表体限制在剩余视口里，让表体自己纵向滚动。
 */
function useFillBodyScrollY(
  rootRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  const [y, setY] = useState<number | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;

    const measure = () => {
      const shell = root.querySelector<HTMLElement>(".pro-table-shell");
      if (!shell) return;
      const style = getComputedStyle(shell);
      const border =
        (Number.parseFloat(style.borderTopWidth) || 0) +
        (Number.parseFloat(style.borderBottomWidth) || 0);
      const content = shell.closest(".pro-layout-content");
      const pad = content
        ? Number.parseFloat(getComputedStyle(content).paddingBottom) || 0
        : 0;
      const next = Math.max(
        160,
        Math.floor(
          window.innerHeight -
          shell.getBoundingClientRect().top -
          readHeight(shell, ".pro-table__toolbar", 48) -
          readHeight(shell, ".ant-table-thead", 39) -
          readHeight(shell, ".ant-pagination", 56) -
          border -
          pad,
        ),
      );
      setY((prev) => (prev != null && Math.abs(prev - next) <= 1 ? prev : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    const page = root.closest(".pro-list-page");
    if (page) observer.observe(page);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled, rootRef]);

  return y;
}

function FillBodyProTable<
  R extends Record<PropertyKey, any>,
  F extends Record<PropertyKey, any>,
>(
  props: {
    columns: ListPageColumnType<R, F>[];
    title?: string;
    widthKey: string;
    columnKey: string;
    scroll?: TableProps<R>["scroll"];
    tableProps?: TableProps<R>;
    loadingWhenEmpty?: boolean;
  },
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fill = props.scroll?.y == null;
  const y = useFillBodyScrollY(rootRef, fill);
  const ctx = useListPageContext<R, F>();
  const scroll =
    fill && y != null ? { ...props.scroll, y } : props.scroll;

  return (
    <div ref={rootRef} style={{ minWidth: 0 }}>
      <ProTable<R, typeof ctx>
        columns={props.columns}
        columnContext={ctx}
        dataSource={ctx.dataSource}
        loading={
          props.loadingWhenEmpty
            ? ctx.loading && ctx.dataSource.length === 0
            : ctx.loading
        }
        rowKey="id"
        density="compact"
        title={props.title}
        columnResize={{ persistenceKey: props.widthKey }}
        columnSetting={{ persistenceKey: props.columnKey }}
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
        tableProps={props.tableProps}
      />
    </div>
  );
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
  return (
    <ClientOnly>
      <FillBodyProTable
        columns={columns}
        title={title}
        widthKey={widthKey}
        columnKey={columnKey}
        scroll={scroll}
        tableProps={tableProps}
        loadingWhenEmpty={loadingWhenEmpty}
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
