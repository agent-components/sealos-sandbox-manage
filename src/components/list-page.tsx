"use client";

import { useEffect } from "react";
import { useListPageContext } from "listpage-components/ListPage";

export function paginate<T>(list: T[], current: number, pageSize: number) {
  const start = Math.max(0, (current - 1) * pageSize);
  return {
    list: list.slice(start, start + pageSize),
    total: list.length,
  };
}

export const listPagination = {
  showSizeChanger: true,
  pageSizeOptions: [10, 20, 50],
  showTotal: (total: number) => `共 ${total} 条`,
};

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
