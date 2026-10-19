"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  DatePicker,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  ListPage,
  type FilterItem,
  type ListPageColumnType,
} from "listpage-components/ListPage";
import { ProDrawer } from "listpage-components/ProDrawer";
import { listPagination } from "@/components/list-page";
import { boatClient } from "@/lib/client";
import type { ApiKey } from "@/lib/apikey/schema";

type McpLogRow = Awaited<
  ReturnType<typeof boatClient.listMcpLogs>
>["logs"][number];

type McpLogFilters = {
  apiKeyId?: string;
  range?: [Dayjs, Dayjs] | null;
};

function formatTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatDuration(ms?: number | null) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} m ${rest} s`;
}

function sandboxIdOf(args: Record<string, unknown> | undefined) {
  const id = args?.id;
  return typeof id === "string" && id.trim() ? id : "";
}

function commandOf(args: Record<string, unknown> | undefined) {
  const command = args?.command;
  return typeof command === "string" ? command : "";
}

function commandResultOf(value: unknown) {
  let data = value;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const nested = record.structuredContent;
  const body =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : record;
  if (
    !("stdout" in body) &&
    !("stderr" in body) &&
    !("ok" in body) &&
    !("exitCode" in body)
  ) {
    return null;
  }
  const exitCode = typeof body.exitCode === "number" ? body.exitCode : undefined;
  const ok = typeof body.ok === "boolean" ? body.ok : exitCode === 0;
  return {
    ok,
    stdout: typeof body.stdout === "string" ? body.stdout : "",
    stderr: typeof body.stderr === "string" ? body.stderr : "",
  };
}

export default function McpLogsPage() {
  const { message } = App.useApp();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [viewId, setViewId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<Awaited<
    ReturnType<typeof boatClient.getMcpLog>
  > | null>(null);

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

  useEffect(() => {
    if (!viewId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    void boatClient
      .getMcpLog(viewId)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((err) => {
        if (!cancelled) {
          message.error(err instanceof Error ? err.message : "加载详情失败");
          setViewId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [message, viewId]);

  const columns: ListPageColumnType<McpLogRow, McpLogFilters>[] = useMemo(
    () => [
      {
        title: "开始时间",
        dataIndex: "startedAt",
        key: "startedAt",
        width: 170,
        render: (value: string, row) =>
          formatTime(value || row.completedAt || row.createdAt),
      },
      {
        title: "耗时",
        dataIndex: "durationMs",
        key: "durationMs",
        width: 88,
        render: (value: number) => formatDuration(value),
      },
      {
        title: "API Key",
        key: "apiKey",
        width: 140,
        ellipsis: true,
        render: (_, row) =>
          row.apiKeyId ? (
            <Typography.Text style={{ fontSize: 13 }}>
              {row.apiKeyName || row.apiKeyId}
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              会话
            </Typography.Text>
          ),
      },
      {
        title: "来源",
        dataIndex: "channel",
        key: "channel",
        width: 72,
        render: (value: string | undefined) => (
          <Tag style={{ marginInlineEnd: 0 }}>
            {(value ?? "mcp") === "rest" ? "REST" : "MCP"}
          </Tag>
        ),
      },
      {
        title: "沙箱",
        key: "sandbox",
        ellipsis: true,
        render: (_, row) => {
          const id = sandboxIdOf(row.arguments);
          if (!id) return <Typography.Text type="secondary">—</Typography.Text>;
          return (
            <Typography.Text
              style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
              ellipsis={{ tooltip: id }}
            >
              {id}
            </Typography.Text>
          );
        },
      },
      {
        title: "工具",
        dataIndex: "tool",
        key: "tool",
        width: 150,
        render: (value: string) => (
          <Typography.Text code style={{ fontSize: 12 }}>
            {value}
          </Typography.Text>
        ),
      },
      {
        title: "状态",
        dataIndex: "status",
        key: "status",
        width: 88,
        render: (status: number, row) => (
          <Tag color={row.ok ? "success" : "error"}>{status}</Tag>
        ),
      },
      {
        title: "操作",
        key: "actions",
        width: 72,
        fixed: "right",
        render: (_, row) => (
          <Button type="link" style={{ padding: 0 }} onClick={() => setViewId(row.id)}>
            详情
          </Button>
        ),
      },
    ],
    [],
  );

  const filterItems = useMemo<FilterItem<McpLogFilters>[]>(
    () => [
      {
        name: "apiKeyId",
        label: "API Key",
        colSpan: 3,
        component: (
          <Select
            allowClear
            placeholder="全部 API Key"
            options={[
              { value: "session", label: "会话登录" },
              ...apiKeys.map((key) => ({
                value: key.id,
                label: key.name,
              })),
            ]}
          />
        ),
      },
      {
        name: "range",
        label: "开始时间",
        colSpan: 4 as const,
        component: (
          <DatePicker.RangePicker
            showTime
            style={{ width: "100%" }}
            placeholder={["开始时间起", "开始时间止"]}
            presets={[
              {
                label: "近 1 小时",
                value: [dayjs().subtract(1, "hour"), dayjs()],
              },
              {
                label: "近 24 小时",
                value: [dayjs().subtract(24, "hour"), dayjs()],
              },
              {
                label: "近 7 天",
                value: [dayjs().subtract(7, "day"), dayjs()],
              },
            ]}
          />
        ),
      },
    ],
    [apiKeys],
  );

  return (
    <>
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
        initialValues={{ pageSize: 20 }}
      />

      <ProDrawer
        open={!!viewId}
        size="medium"
        title={
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, lineHeight: 1.4 }}>
              {sandboxIdOf(detail?.log.arguments) || "调用详情"}
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: 12,
                fontWeight: 400,
                lineHeight: 1.4,
                color: "var(--ant-color-text-secondary)",
              }}
            >
              {formatTime(
                detail?.log.startedAt ||
                  detail?.log.completedAt ||
                  detail?.log.createdAt,
              )}
            </div>
          </div>
        }
        onClose={() => setViewId(null)}
      >
        {detailLoading || !detail ? (
          <Typography.Text type="secondary">加载中…</Typography.Text>
        ) : (
          <LogDetail detail={detail} />
        )}
      </ProDrawer>
    </>
  );
}
