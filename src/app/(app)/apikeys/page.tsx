"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { boatClient } from "@/lib/client";
import type { ApiKey } from "@/lib/apikey/schema";
import type { Sandbox } from "@/lib/sandbox/schema";

function formatTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function ApiKeysPage() {
  const { message, modal } = App.useApp();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sandboxIds, setSandboxIds] = useState<string[]>([]);
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [sandboxesLoading, setSandboxesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accessKey, setAccessKey] = useState<ApiKey | null>(null);
  const [accessIds, setAccessIds] = useState<string[]>([]);
  const [accessSaving, setAccessSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await boatClient.listApiKeys();
      setApiKeys(res.apiKeys);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    setName("");
    setSandboxIds([]);
    setOpen(true);
    void loadSandboxes();
  }

  function openAccess(item: ApiKey) {
    setAccessKey(item);
    setAccessIds(item.sandboxIds ?? []);
    void loadSandboxes();
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      message.error("请填写名称");
      return;
    }
    setSaving(true);
    try {
      await boatClient.createApiKey({ name: trimmed, sandboxIds });
      message.success("API Key 已创建");
      setOpen(false);
      await refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveAccess() {
    if (!accessKey) return;
    setAccessSaving(true);
    try {
      await boatClient.updateApiKeySandboxes(accessKey.id, accessIds);
      message.success("权限已更新");
      setAccessKey(null);
      await refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setAccessSaving(false);
    }
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
        await refresh();
      },
    });
  }

  const columns: ColumnsType<ApiKey> = useMemo(
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
        width: 120,
        align: "right",
        fixed: "right",
        render: (_, item) => (
          <Space size={0}>
            <Button
              type="link"
              size="small"
              style={{ paddingInline: 4 }}
              onClick={() => openAccess(item)}
            >
              权限
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
    [],
  );

  return (
    <>
      <Flex
        align="flex-start"
        justify="space-between"
        gap={16}
        wrap
        style={{ marginBottom: 24 }}
      >
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            API Key
          </Typography.Title>
          <Typography.Text type="secondary">
            每把 Key 只能访问被授权的沙箱。用它创建的沙箱会自动加入授权列表
          </Typography.Text>
        </div>
        <Button type="primary" onClick={openCreate}>
          新建 API Key
        </Button>
      </Flex>

      <div className="boat-table-wrap">
        <Table<ApiKey>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={apiKeys}
          pagination={false}
          scroll={{ x: 1100 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="还没有 API Key"
              >
                <Button type="primary" onClick={openCreate}>
                  新建 API Key
                </Button>
              </Empty>
            ),
          }}
        />
      </div>

      <Modal
        title="新建 API Key"
        open={open}
        onCancel={() => {
          if (!saving) setOpen(false);
        }}
        centered
        destroyOnHidden
        width={480}
        confirmLoading={saving}
        okText="创建"
        cancelText="取消"
        mask={{ closable: !saving }}
        cancelButtonProps={{ disabled: saving }}
        onOk={() => void create()}
      >
        <Form
          layout="horizontal"
          disabled={saving}
          labelCol={{ flex: "72px" }}
          wrapperCol={{ flex: 1 }}
          labelAlign="right"
          colon={false}
          style={{ marginTop: 16 }}
        >
          <Form.Item label="名称" required>
            <Input
              value={name}
              maxLength={64}
              placeholder="例如 CI、本地脚本"
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onPressEnter={() => void create()}
            />
          </Form.Item>
          <Form.Item label="沙箱" style={{ marginBottom: 0 }}>
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="可先不选，之后只能访问用这把 Key 创建的沙箱"
              loading={sandboxesLoading}
              value={sandboxIds}
              options={sandboxes.map((item) => ({
                value: item.id,
                label: item.name || item.id,
              }))}
              onChange={setSandboxIds}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={accessKey ? `沙箱权限 · ${accessKey.name}` : "沙箱权限"}
        open={!!accessKey}
        onCancel={() => {
          if (!accessSaving) setAccessKey(null);
        }}
        centered
        destroyOnHidden
        width={480}
        confirmLoading={accessSaving}
        okText="保存"
        cancelText="取消"
        mask={{ closable: !accessSaving }}
        cancelButtonProps={{ disabled: accessSaving }}
        onOk={() => void saveAccess()}
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
          只能访问这里列出的沙箱。用这把 Key 新建的沙箱会自动加进来。
        </Typography.Paragraph>
        <Select
          mode="multiple"
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="选择允许访问的沙箱"
          style={{ width: "100%" }}
          loading={sandboxesLoading}
          value={accessIds}
          options={sandboxes.map((item) => ({
            value: item.id,
            label: item.name || item.id,
          }))}
          onChange={setAccessIds}
          disabled={accessSaving}
        />
      </Modal>
    </>
  );
}
