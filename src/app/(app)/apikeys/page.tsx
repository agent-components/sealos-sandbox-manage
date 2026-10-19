"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CopyOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, Select, Space, Tag, Tooltip, Typography } from "antd";
import { ListPage, type ListPageColumnType } from "listpage-components/ListPage";
import { FormModal } from "listpage-components/FormModal";
import { BindListRefresh, listPagination, paginate } from "@/components/list-page";
import { boatClient } from "@/lib/client";
import type { ApiKey } from "@/lib/apikey/schema";
import type { Sandbox } from "@/lib/sandbox/schema";
import type { Template } from "@/lib/template/schema";

function formatTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

/** Cursor / MCP 客户端接入用的配置片段。key 必须是复制接口返回的明文。 */
function mcpConnectJson(key: string) {
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

type ApiKeyFilters = { q?: string };
type ApiKeyForm = { name: string; sandboxIds?: string[] };

export default function ApiKeysPage() {
  const { message, modal } = App.useApp();
  const refreshRef = useRef<() => void>(() => { });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
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
      const [sandboxRes, templateRes] = await Promise.all([
        boatClient.listSandboxes(),
        boatClient.listTemplates().catch(() => ({ templates: [] as Template[] })),
      ]);
      setSandboxes(sandboxRes.sandboxes);
      setTemplates(templateRes.templates);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "沙箱列表加载失败");
    } finally {
      setSandboxesLoading(false);
    }
  }, [message]);

  const sandboxOptions = useMemo(
    () => {
      const templateNameById = new Map(
        templates.map((item) => [item.id, item.name || item.id]),
      );
      return sandboxes.map((item) => ({
        value: item.id,
        label: item.id,
        templateName: item.templateId
          ? templateNameById.get(item.templateId) || item.templateId
          : "",
      }));
    },
    [sandboxes, templates],
  );

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

  const copyText = useCallback(
    async (id: string, write: (key: string) => string, success: string) => {
      try {
        const { key } = await boatClient.getApiKeySecret(id);
        await navigator.clipboard.writeText(write(key));
        message.success(success);
      } catch (err) {
        message.error(err instanceof Error ? err.message : "复制失败");
      }
    },
    [message],
  );

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
        width: 200,
        render: (key: string, item) => (
          <Space size={4}>
            <Typography.Text style={{ fontFamily: "var(--font-mono)" }}>
              {key}
            </Typography.Text>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              aria-label="复制密钥"
              onClick={() => void copyText(item.id, (secret) => secret, "已复制")}
            />
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
        render: (_, item) => (
          <Space size={0}>
            <Button
              type="link"
              size="small"
              style={{ paddingInline: 4 }}
              onClick={() =>
                void copyText(item.id, mcpConnectJson, "已复制 MCP 接入配置")
              }
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
    [copyText, message],
  );

  return (
    <>
      <ListPage<ApiKey, ApiKeyFilters>
        title={
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              令牌管理
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
            placeholder="选择允许访问的沙箱"
            loading={sandboxesLoading}
            options={sandboxOptions}
            filterOption={(input, option) => {
              const keyword = input.trim().toLowerCase();
              if (!keyword) return true;
              const label = String(option?.label ?? "").toLowerCase();
              const templateName = String(option?.templateName ?? "").toLowerCase();
              return label.includes(keyword) || templateName.includes(keyword);
            }}
            optionRender={(option) => (
              <div style={{ padding: "2px 0", lineHeight: 1.35 }}>
                <div>{option.label}</div>
                {option.data.templateName ? (
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 12,
                      color: "var(--ant-color-text-secondary)",
                    }}
                  >
                    {option.data.templateName}
                  </div>
                ) : null}
              </div>
            )}
          />
        </Form.Item>
      </FormModal>
    </>
  );
}
