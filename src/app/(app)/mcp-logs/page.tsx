"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, Typography } from "antd";
import {
  ListPage,
  type FloatComponentProps,
} from "listpage-components/ListPage";
import { listPagination } from "@/components/list-page";
import { boatClient } from "@/lib/client";
import type { ApiKey } from "@/lib/apikey/schema";
import { mcpLogColumns } from "./columns";
import { McpLogDetailDrawer } from "./detail";
import { mcpLogFilters } from "./filters";
import type { McpLogFilters, McpLogRow } from "./types";

export default function McpLogsPage() {
  const { message } = App.useApp();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);

  useEffect(() => {
    void boatClient
      .listApiKeys()
      .then((res) => setApiKeys(res.apiKeys))
      .catch(() => undefined);
  }, []);

  const request = useCallback(
    async (
      page: { current: number; pageSize: number },
      filters: McpLogFilters,
    ) => {
      try {
        const range = filters.range;
        const res = await boatClient.listMcpLogs({
          page: page.current,
          pageSize: page.pageSize,
          ...(filters.apiKeyId ? { apiKeyId: filters.apiKeyId } : {}),
          ...(range?.[0] ? { from: range[0].toISOString() } : {}),
          ...(range?.[1] ? { to: range[1].toISOString() } : {}),
        });
        return { list: res.logs, total: res.total };
      } catch (err) {
        message.error(err instanceof Error ? err.message : "加载失败");
        return { list: [], total: 0 };
      }
    },
    [message],
  );

  const columns = useMemo(() => mcpLogColumns(), []);
  const filterItems = useMemo(() => mcpLogFilters(apiKeys), [apiKeys]);
  const floats = useMemo(
    () => [
      {
        key: "detail",
        render: ({ record, onClose }: FloatComponentProps<McpLogRow>) => (
          <McpLogDetailDrawer logId={record?.id ?? null} onClose={() => onClose()} />
        ),
      },
    ],
    [],
  );

  return (
    <ListPage<McpLogRow, McpLogFilters>
        title={
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              调用日志
            </Typography.Title>
            <Typography.Text type="secondary">
              只记录 runSandboxCommand（MCP 与 REST）；命令结果存在对象存储
            </Typography.Text>
          </div>
        }
        extra={(ctx) => (
          <Button onClick={() => ctx.refreshTable()}>刷新</Button>
        )}
        filter={{ items: filterItems }}
        table={{
          rowKey: "id",
          columns,
          density: "compact",
          title: "日志",
          columnResize: { persistenceKey: "boat-mcp-logs-width" },
          columnSetting: { persistenceKey: "boat-mcp-logs-columns" },
          extra: (_ctx, columnSetting) => columnSetting?.trigger ?? null,
          scroll: { x: 1100, y: "calc(100vh - 420px)" },
          pagination: listPagination,
        }}
        request={request}
        float={{ floats }}
        initialValues={{ pageSize: 20 }}
      />
  );
}
