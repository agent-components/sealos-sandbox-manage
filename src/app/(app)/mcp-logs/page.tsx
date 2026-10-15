"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  DatePicker,
  Drawer,
  Empty,
  Flex,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { boatClient } from "@/lib/client";
import type { ApiKey } from "@/lib/apikey/schema";

type McpLogRow = Awaited<
  ReturnType<typeof boatClient.listMcpLogs>
>["logs"][number];

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

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function McpLogsPage() {
  const { message } = App.useApp();
  const [logs, setLogs] = useState<McpLogRow[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKeyId, setApiKeyId] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await boatClient.listMcpLogs({
        limit: 100,
        ...(apiKeyId ? { apiKeyId } : {}),
        ...(range?.[0] ? { from: range[0].toISOString() } : {}),
        ...(range?.[1] ? { to: range[1].toISOString() } : {}),
      });
      setLogs(res.logs);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [apiKeyId, message, range]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  const columns: ColumnsType<McpLogRow> = useMemo(
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
        title: "接口",
        key: "endpoint",
        ellipsis: true,
        render: (_, row) => (
          <Typography.Text style={{ fontSize: 13 }}>
            <Typography.Text type="secondary">{row.method}</Typography.Text>{" "}
            {row.path}
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
        title: "",
        key: "actions",
        width: 72,
        render: (_, row) => (
          <Button type="link" style={{ padding: 0 }} onClick={() => setViewId(row.id)}>
            详情
          </Button>
        ),
      },
    ],
    [],
  );

  const hasFilter = !!apiKeyId || !!(range?.[0] || range?.[1]);

  return (
    <div>
      <Flex align="center" justify="space-between" style={{ marginBottom: 16 }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            调用日志
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: "6px 0 0" }}>
            记录 MCP 与 OpenAPI/REST 沙箱调用；结果存对象存储，获取文件只记元数据不落结果
          </Typography.Paragraph>
        </div>
        <Button onClick={() => void refresh()} loading={loading}>
          刷新
        </Button>
      </Flex>

      <Flex gap={12} wrap="wrap" style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="全部 API Key"
          value={apiKeyId}
          style={{ width: 220 }}
          options={[
            { value: "session", label: "会话登录" },
            ...apiKeys.map((key) => ({
              value: key.id,
              label: key.name,
            })),
          ]}
          onChange={(value) => setApiKeyId(value)}
        />
        <DatePicker.RangePicker
          showTime
          value={range}
          style={{ width: 380 }}
          placeholder={["开始时间起", "开始时间止"]}
          onChange={(value) => setRange(value)}
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
        {hasFilter ? (
          <Button
            onClick={() => {
              setApiKeyId(undefined);
              setRange(null);
            }}
          >
            清除筛选
          </Button>
        ) : null}
      </Flex>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={logs}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={hasFilter ? "没有符合条件的日志" : "还没有调用日志"}
            />
          ),
        }}
      />

      <Drawer
        title={detail?.log.tool ?? "调用详情"}
        open={!!viewId}
        onClose={() => setViewId(null)}
        width={720}
        destroyOnHidden
      >
        {detailLoading || !detail ? (
          <Typography.Text type="secondary">加载中…</Typography.Text>
        ) : (
          <Space direction="vertical" size={20} style={{ width: "100%" }}>
            <div>
              <Typography.Text type="secondary">开始时间</Typography.Text>
              <div>
                {formatTime(
                  detail.log.startedAt ||
                  detail.log.completedAt ||
                  detail.log.createdAt,
                )}
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">耗时</Typography.Text>
              <div>{formatDuration(detail.log.durationMs)}</div>
            </div>
            <div>
              <Typography.Text type="secondary">API Key</Typography.Text>
              <div>
                {detail.log.apiKeyId ? (
                  <>
                    <div>{detail.log.apiKeyName || "—"}</div>
                    <Typography.Text
                      type="secondary"
                      copyable
                      style={{ fontSize: 12 }}
                    >
                      {detail.log.apiKeyId}
                    </Typography.Text>
                  </>
                ) : (
                  <Typography.Text type="secondary">会话登录</Typography.Text>
                )}
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">来源</Typography.Text>
              <div>
                <Tag style={{ marginInlineEnd: 0 }}>
                  {(detail.log.channel ?? "mcp") === "rest" ? "REST" : "MCP"}
                </Tag>
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">接口</Typography.Text>
              <div>
                {detail.log.method} {detail.log.path}
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">状态</Typography.Text>
              <div>
                <Tag color={detail.log.ok ? "success" : "error"}>
                  {detail.log.status}
                </Tag>
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">参数</Typography.Text>
              <pre
                style={{
                  margin: "8px 0 0",
                  padding: 12,
                  background: "#fafafa",
                  border: "1px solid #f0f0f0",
                  borderRadius: 8,
                  fontSize: 12,
                  overflow: "auto",
                  maxHeight: 240,
                }}
              >
                {prettyJson(detail.log.arguments)}
              </pre>
            </div>
            <div>
              <Typography.Text type="secondary">结果</Typography.Text>
              {detail.resultLoadError ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 8 }}
                  message={detail.resultLoadError}
                />
              ) : !detail.log.resultKey ? (
                <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0" }}>
                  {detail.log.tool === "getSandboxArtifact"
                    ? "获取文件不保存结果内容"
                    : "无结果"}
                </Typography.Paragraph>
              ) : (
                <pre
                  style={{
                    margin: "8px 0 0",
                    padding: 12,
                    background: "#fafafa",
                    border: "1px solid #f0f0f0",
                    borderRadius: 8,
                    fontSize: 12,
                    overflow: "auto",
                    maxHeight: 360,
                  }}
                >
                  {prettyJson(detail.result)}
                </pre>
              )}
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
