"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { App, Button, Form, Input, Select, Space, Typography } from "antd";
import { ListPage, type ListPageColumnType } from "listpage-components/ListPage";
import { FormModal } from "listpage-components/FormModal";
import { BindListRefresh, listPagination, paginate } from "@/components/list-page";
import { boatClient } from "@/lib/client";
import type { ApiKey } from "@/lib/apikey/schema";
import type { Sandbox } from "@/lib/sandbox/schema";

function formatTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

/** Cursor / MCP 客户端接入用的配置片段 */
function mcpConnectJson(apiKey: ApiKey) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  return JSON.stringify(
    {
      mcpServers: {
        boat: {
          url: `${origin}/api/mcp`,
          headers: {
            Authorization: `Bearer ${apiKey.key}`,
          },
        },
      },
    },
    null,
    2,
  );
}

type ApiKeyFilters = { q?: string };
type ApiKeyForm = { name: string; sandboxIds?: string[] };

export default function ApiKeysPage() {
  const { message, modal } = App.useApp();
  const refreshRef = useRef<() => void>(() => { });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [sandboxesLoading, setSandboxesLoading] = useState(false);

  const bindRefresh = useCallback((refresh: () => void) => {
    refreshRef.current = refresh;
  }, []);

  const request = useCallback(
    async (
      page: { current: number; pageSize: number },
      filters: ApiKeyFilters,
    ) => {
      try {
        const res = await boatClient.listApiKeys();
        let list = res.apiKeys;
        const keyword = filters.q?.trim().toLowerCase();
        if (keyword) {
          list = list.filter(
            (item) =>
              item.name.toLowerCase().includes(keyword) ||
              item.key.toLowerCase().includes(keyword),
          );
        }
        return paginate(list, page.current, page.pageSize);
      } catch (err) {
        message.error(err instanceof Error ? err.message : "加载失败");
        return { list: [], total: 0 };
      }
    },
    [message],
  );

  const loadSandboxes = useCallback(async () => {
    setSandboxesLoading(true);
    try {
      const res = await boatClient.listSandboxes();
      setSandboxes(res.sandboxes);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "沙箱列表加载失败");
    } finally {
      setSandboxesLoading(false);
    }
  }, [message]);

  function openCreate() {
    setEditing(null);
    setOpen(true);
    void loadSandboxes();
  }

  function openEdit(item: ApiKey) {
    setEditing(item);
    setOpen(true);
    void loadSandboxes();
  }

  async function save(values: ApiKeyForm) {
    const trimmed = values.name.trim();
    if (!trimmed) {
      message.error("请填写名称");
      throw new Error("名称必填");
    }
    const sandboxIds = values.sandboxIds ?? [];
    if (editing) {
      await boatClient.updateApiKey(editing.id, { name: trimmed, sandboxIds });
      message.success("已保存");
    } else {
      await boatClient.createApiKey({ name: trimmed, sandboxIds });
      message.success("API Key 已创建");
    }
    setOpen(false);
    refreshRef.current();
  }

  function confirmDelete(item: ApiKey) {
    modal.confirm({
      title: "删除 API Key",
      content: `确认删除「${item.name}」？使用该密钥的请求将立即失效。`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await boatClient.deleteApiKey(item.id);
        message.success("已删除");
        refreshRef.current();
      },
    });
  }

  const columns: ListPageColumnType<ApiKey, ApiKeyFilters>[] = useMemo(
    () => [
      {
        title: "名称",
        dataIndex: "name",
        width: 160,
        fixed: "left",
      },
      {
        title: "密钥",
        dataIndex: "key",
        render: (key: string) => (
          <Typography.Text
            copyable={{ text: key, tooltips: ["复制", "已复制"] }}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {key}
          </Typography.Text>
        ),
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
        title: "可访问沙箱",
        dataIndex: "sandboxIds",
        width: 220,
        render: (ids: string[] = []) =>
          ids.length === 0 ? (
            <Typography.Text type="secondary">无</Typography.Text>
          ) : (
            <Typography.Text ellipsis={{ tooltip: ids.join("、") }}>
              {ids.length <= 2
                ? ids.join("、")
                : `${ids.slice(0, 2).join("、")} 等 ${ids.length} 个`}
            </Typography.Text>
          ),
      },
      {
        title: "操作",
        key: "actions",
        width: 180,
        align: "right",
        fixed: "right",
        render: (_, item) => (
          <Space size={0}>
            <Button
              type="link"
              size="small"
              style={{ paddingInline: 4 }}
              onClick={() => {
                void navigator.clipboard
                  .writeText(mcpConnectJson(item))
                  .then(() => message.success("已复制 MCP 接入配置"))
                  .catch(() => message.error("复制失败"));
              }}
            >
              复制 MCP
            </Button>
            <Button
              type="link"
              size="small"
              style={{ paddingInline: 4 }}
              onClick={() => openEdit(item)}
            >
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              danger
              style={{ paddingInline: 4 }}
              onClick={() => confirmDelete(item)}
            >
              删除
            </Button>
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [message],
  );

  return (
    <>
      <ListPage<ApiKey, ApiKeyFilters>
        title={
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              API Key
            </Typography.Title>
            <Typography.Text type="secondary">
              每把 Key 只能访问被授权的沙箱。用它创建的沙箱会自动加入授权列表
            </Typography.Text>
          </div>
        }
        extra={
          <Button type="primary" onClick={openCreate}>
            新建 API Key
          </Button>
        }
        filter={{
          items: [
            { name: "q", label: "关键词", placeholder: "名称或密钥" },
          ],
        }}
        middle={<BindListRefresh onReady={bindRefresh} />}
        table={{
          rowKey: "id",
          columns,
          density: "compact",
          title: "密钥列表",
          columnResize: { persistenceKey: "boat-apikeys-width" },
          columnSetting: { persistenceKey: "boat-apikeys-columns" },
          extra: (_ctx, columnSetting) => columnSetting?.trigger ?? null,
          scroll: { x: 1160 },
          pagination: listPagination,
        }}
        request={request}
        initialValues={{ pageSize: 20 }}
      />

      <FormModal<ApiKeyForm>
        title={editing ? "编辑 API Key" : "新建 API Key"}
        open={open}
        initialValues={{
          name: editing?.name ?? "",
          sandboxIds: editing?.sandboxIds ?? [],
        }}
        onCancel={() => setOpen(false)}
        onOk={save}
        modalProps={{ centered: true, width: 480, okText: editing ? "保存" : "创建" }}
        formProps={{
          layout: "horizontal",
          labelCol: { flex: "72px" },
          wrapperCol: { flex: 1 },
          labelAlign: "right",
          colon: false,
          style: { marginTop: 16 },
        }}
      >
        <Form.Item
          label="名称"
          name="name"
          rules={[{ required: true, message: "请填写名称" }]}
        >
          <Input maxLength={64} placeholder="例如 CI、本地脚本" autoFocus />
        </Form.Item>
        <Form.Item
          label="沙箱"
          name="sandboxIds"
          extra="用这把 Key 新建的沙箱会自动加入"
          style={{ marginBottom: 0 }}
        >
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择允许访问的沙箱"
            loading={sandboxesLoading}
            options={sandboxes.map((item) => ({
              value: item.id,
              label: item.name || item.id,
            }))}
          />
        </Form.Item>
      </FormModal>
    </>
  );
}
