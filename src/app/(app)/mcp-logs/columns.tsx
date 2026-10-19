"use client";

import { Button, Tag, Typography } from "antd";
import type { ListPageColumnType } from "listpage-components/ListPage";
import {
  formatDuration,
  formatTime,
  sandboxIdOf,
  type McpLogFilters,
  type McpLogRow,
} from "./types";

export function mcpLogColumns(): ListPageColumnType<McpLogRow, McpLogFilters>[] {
  return [
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
      title: "令牌",
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
      component: ({ record, ctx }) => (
        <Button
          type="link"
          style={{ padding: 0 }}
          onClick={() => ctx.showFloat("detail", record)}
        >
          详情
        </Button>
      ),
    },
  ];
}
