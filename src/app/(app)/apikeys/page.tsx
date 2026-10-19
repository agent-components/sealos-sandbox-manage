"use client";

import { useCallback, useMemo } from "react";
import { App, Button, Typography } from "antd";
import {
  ListPage,
  useListPageContext,
  type FloatComponentProps,
} from "listpage-components/ListPage";
import { listPagination } from "@/components/list-page";
import { sandboxClient } from "@/lib/client";
import type { ApiKey } from "@/lib/apikey/schema";
import { apiKeyColumns, type ApiKeyFilters } from "./columns";
import { ApiKeyFormModal } from "./form";

function ApiKeyFormFloat({
  record,
  onClose,
}: FloatComponentProps<ApiKey>) {
  const { refreshTable } = useListPageContext<ApiKey, ApiKeyFilters>();
  return (
    <ApiKeyFormModal
      open
      editing={record ?? null}
      onClose={() => onClose()}
      onSaved={refreshTable}
    />
  );
}

export default function ApiKeysPage() {
  const { message } = App.useApp();

  const request = useCallback(
    async (
      page: { current: number; pageSize: number },
      filters: ApiKeyFilters,
    ) => {
      try {
        const res = await sandboxClient.listApiKeys({
          current: page.current,
          pageSize: page.pageSize,
          ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
        });
        return { list: res.list, total: res.total };
      } catch (err) {
        message.error(err instanceof Error ? err.message : "加载失败");
        return { list: [], total: 0 };
      }
    },
    [message],
  );

  const columns = useMemo(() => apiKeyColumns(), []);
  const floats = useMemo(
    () => [
      {
        key: "editor",
        render: (props: FloatComponentProps<ApiKey>) => (
          <ApiKeyFormFloat {...props} />
        ),
      },
    ],
    [],
  );

  return (
    <ListPage<ApiKey, ApiKeyFilters>
      title={
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            令牌管理
          </Typography.Title>
          <Typography.Text type="secondary">
            每把令牌只能访问被授权的沙箱。用它创建的沙箱会自动加入授权列表
          </Typography.Text>
        </div>
      }
      extra={(ctx) => (
        <Button type="primary" onClick={() => ctx.showFloat("editor")}>
          新建令牌
        </Button>
      )}
      filter={{
        items: [{ name: "q", label: "关键词", placeholder: "名称或密钥" }],
      }}
      table={{
        rowKey: "id",
        columns,
        density: "compact",
        title: "令牌列表",
        columnResize: { persistenceKey: "sandbox-apikeys-width" },
        columnSetting: { persistenceKey: "sandbox-apikeys-columns" },
        extra: (_ctx, columnSetting) => columnSetting?.trigger ?? null,
        scroll: { x: 1160 },
        pagination: listPagination,
      }}
      request={request}
      float={{ floats }}
      initialValues={{ pageSize: 20 }}
    />
  );
}
