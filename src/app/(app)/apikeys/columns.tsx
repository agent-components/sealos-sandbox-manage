"use client";

import { CopyOutlined } from "@ant-design/icons";
import { App, Button, Space, Tag, Tooltip, Typography } from "antd";
import type {
  ListPageColumnType,
  ListPageContextValue,
} from "listpage-components/ListPage";
import { boatClient } from "@/lib/client";
import type { ApiKey } from "@/lib/apikey/schema";

export type ApiKeyFilters = { q?: string };

function formatTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

/** Cursor / MCP 客户端接入用的配置片段。key 必须是复制接口返回的明文。 */
export function mcpConnectJson(key: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  return JSON.stringify(
    {
      mcpServers: {
        boat: {
          url: `${origin}/api/mcp`,
          headers: {
            Authorization: `Bearer ${key}`,
          },
        },
      },
    },
    null,
    2,
  );
}

function SandboxAccess({ ids }: { ids?: string[] }) {
  const list = ids ?? [];
  if (list.length === 0) {
    return <Typography.Text type="secondary">无</Typography.Text>;
  }
  const [first, ...rest] = list;
  return (
    <Space size={6}>
      <span>{first}</span>
      {rest.length > 0 ? (
        <Tooltip
          title={
            <div>
              {rest.map((id) => (
                <div key={id}>{id}</div>
              ))}
            </div>
          }
        >
          <Tag style={{ marginInlineEnd: 0, cursor: "default" }}>+{rest.length}</Tag>
        </Tooltip>
      ) : null}
    </Space>
  );
}

function CopySecretButton({ id }: { id: string }) {
  const { message } = App.useApp();
  return (
    <Button
      type="text"
      size="small"
      icon={<CopyOutlined />}
      aria-label="复制密钥"
      onClick={() => copySecret(id, (secret) => secret, "已复制", message)}
    />
  );
}

function copySecret(
  id: string,
  write: (key: string) => string,
  success: string,
  notify: { success: (text: string) => void; error: (text: string) => void },
) {
  void boatClient
    .getApiKeySecret(id)
    .then(async ({ key }) => {
      await navigator.clipboard.writeText(write(key));
      notify.success(success);
    })
    .catch((err: unknown) => {
      notify.error(err instanceof Error ? err.message : "复制失败");
    });
}

function ApiKeyActions({
  record,
  ctx,
}: {
  record: ApiKey;
  ctx: ListPageContextValue<ApiKey, ApiKeyFilters>;
}) {
  const { message, modal } = App.useApp();
  return (
    <Space size={0}>
      <Button
        type="link"
        size="small"
        style={{ paddingInline: 4 }}
        onClick={() => copySecret(record.id, mcpConnectJson, "已复制 MCP 接入配置", message)}
      >
        复制 MCP
      </Button>
      <Button
        type="link"
        size="small"
        style={{ paddingInline: 4 }}
        onClick={() => ctx.showFloat("editor", record)}
      >
        编辑
      </Button>
      <Button
        type="link"
        size="small"
        danger
        style={{ paddingInline: 4 }}
        onClick={() =>
          modal.confirm({
            title: "删除令牌",
            content: `确认删除「${record.name}」？使用该密钥的请求将立即失效。`,
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
              await boatClient.deleteApiKey(record.id);
              message.success("已删除");
              ctx.refreshTable();
            },
          })
        }
      >
        删除
      </Button>
    </Space>
  );
}

export function apiKeyColumns(): ListPageColumnType<ApiKey, ApiKeyFilters>[] {
  return [
    {
      title: "名称",
      dataIndex: "name",
      width: 160,
      fixed: "left",
    },
    {
      title: "密钥",
      dataIndex: "key",
      width: 200,
      render: (key: string, item) => (
        <Space size={4}>
          <Typography.Text style={{ fontFamily: "var(--font-mono)" }}>
            {key}
          </Typography.Text>
          <CopySecretButton id={item.id} />
        </Space>
      ),
    },
    {
      title: "可访问沙箱",
      dataIndex: "sandboxIds",
      width: 240,
      render: (ids: string[] = []) => <SandboxAccess ids={ids} />,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 180,
      valueType: "date",
      render: (value: string) => (
        <Typography.Text type="secondary">{formatTime(value)}</Typography.Text>
      ),
    },
    {
      title: "最近使用",
      dataIndex: "lastUsedAt",
      width: 180,
      render: (value: string | null) => (
        <Typography.Text type="secondary">{formatTime(value)}</Typography.Text>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 180,
      align: "right",
      fixed: "right",
      component: ({ record, ctx }) => <ApiKeyActions record={record} ctx={ctx} />,
    },
  ];
}
