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
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { boatClient } from "@/lib/client";
import type { ApiKey } from "@/lib/apikey/schema";

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
  const [saving, setSaving] = useState(false);

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

  function openCreate() {
    setName("");
    setOpen(true);
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      message.error("请填写名称");
      return;
    }
    setSaving(true);
    try {
      await boatClient.createApiKey(trimmed);
      message.success("API Key 已创建");
      setOpen(false);
      await refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSaving(false);
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
        title: "操作",
        key: "actions",
        width: 80,
        align: "right",
        fixed: "right",
        render: (_, item) => (
          <Space size={0}>
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
            用于脚本和 Agent 调用 REST API，密钥长期保留，可随时复制
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
          scroll={{ x: 900 }}
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
          <Form.Item label="名称" required style={{ marginBottom: 0 }}>
            <Input
              value={name}
              maxLength={64}
              placeholder="例如 CI、本地脚本"
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onPressEnter={() => void create()}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
