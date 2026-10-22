"use client";

import { useState } from "react";
import { App, Button, Space, Tag, Typography } from "antd";
import type {
  ListPageColumnType,
  ListPageContextValue,
} from "listpage-components/ListPage";
import { StateBadge } from "@/components/StateBadge";
import { sandboxClient } from "@/lib/client";
import type { Sandbox } from "@/lib/sandbox/schema";
import { memoryLabel } from "@/lib/sealos/resources";
import type { SandboxFilters } from "./filters";

function formatCreatedAt(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function canStop(state: Sandbox["state"]) {
  return state === "running" || state === "starting";
}

export function canStart(state: Sandbox["state"]) {
  return state === "stopped" || state === "error";
}

function SandboxActions({
  record,
  ctx,
}: {
  record: Sandbox;
  ctx: ListPageContextValue<Sandbox, SandboxFilters>;
}) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const powerLabel = canStop(record.state) ? "关机" : "开机";
  const powerDisabled =
    busy || (!canStop(record.state) && !canStart(record.state));

  async function runPower() {
    setBusy(true);
    try {
      if (canStop(record.state)) {
        await sandboxClient.stopSandbox(record.id);
        message.success("已关机");
      } else {
        await sandboxClient.resumeSandbox(record.id);
        message.success("已开机");
      }
      ctx.refreshTable();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space size={0}>
      <Button
        type="link"
        size="small"
        style={{ paddingInline: 2 }}
        onClick={() => ctx.showFloat("detail", record)}
      >
        查看
      </Button>
      <Button
        type="link"
        size="small"
        style={{ paddingInline: 2 }}
        onClick={() => ctx.showFloat("logs", record)}
      >
        日志
      </Button>
      <Button
        type="link"
        size="small"
        style={{ paddingInline: 2 }}
        loading={busy}
        disabled={powerDisabled && !busy}
        onClick={() => void runPower()}
      >
        {powerLabel}
      </Button>
      <Button
        type="link"
        size="small"
        danger
        style={{ paddingInline: 2 }}
        disabled={busy}
        onClick={() => ctx.showFloat("delete", record)}
      >
        删除
      </Button>
    </Space>
  );
}

export function sandboxColumns(
  templateNameById: Map<string, string>,
): ListPageColumnType<Sandbox, SandboxFilters>[] {
  return [
    {
      title: "名称",
      dataIndex: "id",
      key: "id",
      width: 160,
      fixed: "left",
      render: (id: string) => (
        <Typography.Text
          strong
          style={{ fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}
        >
          {id}
        </Typography.Text>
      ),
    },
    {
      title: "模板",
      dataIndex: "templateId",
      key: "templateId",
      width: 180,
      render: (id?: string) => {
        if (!id) return "—";
        const name = templateNameById.get(id);
        return (
          <Typography.Text type="secondary" style={{ whiteSpace: "nowrap" }}>
            {name || id}
          </Typography.Text>
        );
      },
    },
    {
      title: "标签",
      dataIndex: "tags",
      key: "tags",
      width: 220,
      component: ({ record, ctx }) =>
        record.tags.length > 0 ? (
          <Space size={4} wrap>
            {record.tags.map((tag) => (
              <Tag
                key={tag}
                style={{ marginInlineEnd: 0, cursor: "pointer" }}
                onClick={() =>
                  ctx.submitFilters({ ...ctx.filters, tag })
                }
              >
                {tag}
              </Tag>
            ))}
          </Space>
        ) : (
          "—"
        ),
    },
    {
      title: "状态",
      dataIndex: "state",
      key: "state",
      width: 100,
      render: (state: Sandbox["state"]) => <StateBadge state={state} />,
    },
    {
      title: "进行中",
      dataIndex: "inflight",
      key: "inflight",
      width: 90,
      align: "right",
      render: (value?: number) => (
        <Typography.Text
          type={value && value > 0 ? undefined : "secondary"}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {value ?? 0}
        </Typography.Text>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (value?: string) => (
        <Typography.Text type="secondary">{formatCreatedAt(value)}</Typography.Text>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      align: "right",
      fixed: "right",
      component: ({ record, ctx }) => (
        <SandboxActions record={record} ctx={ctx} />
      ),
    },
  ];
}
