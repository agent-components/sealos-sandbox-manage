"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ResourceConfig } from "@/components/ResourceConfig";
import { boatClient } from "@/lib/client";
import {
  DEFAULT_RESOURCES,
  memoryLabel,
  type ResourceSpec,
} from "@/lib/sealos/resources";
import type { Template } from "@/lib/template/schema";

type FormState = {
  id: string;
  name: string;
  description: string;
  image: string;
  port: number;
  resources: ResourceSpec;
};

const emptyForm = (): FormState => ({
  id: "",
  name: "",
  description: "",
  image: "",
  port: 80,
  resources: { ...DEFAULT_RESOURCES },
});

export default function TemplatesPage() {
  const { message, modal } = App.useApp();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const refresh = useCallback(async () => {
    try {
      const res = await boatClient.listTemplates();
      setTemplates(res.templates);
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
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(tpl: Template) {
    setEditingId(tpl.id);
    setForm({
      id: tpl.id,
      name: tpl.name,
      description: tpl.description ?? "",
      image: tpl.image,
      port: tpl.port,
      resources: {
        cpu: tpl.cpu,
        memoryGi: tpl.memoryGi,
        diskGi: tpl.diskGi,
      },
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      message.error("请填写模板名称");
      return;
    }
    if (!form.image.trim()) {
      message.error("请填写镜像");
      return;
    }
    if (!editingId) {
      const id = form.id.trim();
      if (!id || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(id)) {
        message.error(
          "模板 ID 只能包含小写字母、数字和连字符，且首尾为字母或数字",
        );
        return;
      }
    }

    setSaving(true);
    try {
      if (editingId) {
        await boatClient.updateTemplate(editingId, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          image: form.image.trim(),
          port: form.port,
          cpu: form.resources.cpu,
          memoryGi: form.resources.memoryGi,
          diskGi: form.resources.diskGi,
        });
        message.success("模板已更新");
      } else {
        await boatClient.createTemplate({
          id: form.id.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          image: form.image.trim(),
          port: form.port,
          cpu: form.resources.cpu,
          memoryGi: form.resources.memoryGi,
          diskGi: form.resources.diskGi,
        });
        message.success("模板已创建");
      }
      setOpen(false);
      await refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(tpl: Template) {
    modal.confirm({
      title: "删除模板",
      content: `确认删除模板「${tpl.name}」（${tpl.id}）？已基于该模板创建的沙箱不受影响。`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await boatClient.deleteTemplate(tpl.id);
        message.success("已删除");
        await refresh();
      },
    });
  }

  const columns: ColumnsType<Template> = useMemo(
    () => [
      {
        title: "ID",
        dataIndex: "id",
        key: "id",
        width: 140,
        render: (id: string) => (
          <Typography.Text style={{ fontFamily: "var(--font-mono)" }}>
            {id}
          </Typography.Text>
        ),
      },
      {
        title: "名称",
        dataIndex: "name",
        key: "name",
      },
      {
        title: "镜像",
        dataIndex: "image",
        key: "image",
        ellipsis: true,
        render: (image: string) => (
          <Typography.Text type="secondary" ellipsis={{ tooltip: image }}>
            {image}
          </Typography.Text>
        ),
      },
      {
        title: "默认规格",
        key: "spec",
        width: 180,
        render: (_, tpl) => (
          <Typography.Text type="secondary">
            {tpl.cpu} 核 · {memoryLabel(tpl.memoryGi)} · {tpl.diskGi}Gi
          </Typography.Text>
        ),
      },
      {
        title: "操作",
        key: "actions",
        width: 140,
        align: "right",
        render: (_, tpl) => (
          <Space size={0}>
            <Button
              type="link"
              size="small"
              style={{ paddingInline: 4 }}
              onClick={() => openEdit(tpl)}
            >
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              danger
              style={{ paddingInline: 4 }}
              onClick={() => confirmDelete(tpl)}
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
            模板
          </Typography.Title>
          <Typography.Text type="secondary">
            沙箱必须基于模板创建；模板定义镜像与默认规格
          </Typography.Text>
        </div>
        <Button type="primary" onClick={openCreate}>
          新建模板
        </Button>
      </Flex>

      <Table<Template>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={templates}
        pagination={false}
        style={{
          border: "1px solid #f0f0f0",
          borderRadius: 8,
          overflow: "hidden",
        }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有模板"
            >
              <Button type="primary" onClick={openCreate}>
                新建模板
              </Button>
            </Empty>
          ),
        }}
      />

      <Modal
        title={editingId ? "编辑模板" : "新建模板"}
        open={open}
        onCancel={() => setOpen(false)}
        centered
        destroyOnHidden
        width={560}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        onOk={() => void save()}
      >
        <Form layout="vertical" disabled={saving}>
          {!editingId ? (
            <Form.Item
              label="模板 ID"
              extra="创建后不可修改；小写字母、数字和连字符"
              required
            >
              <Input
                value={form.id}
                maxLength={48}
                placeholder="例如 nginx"
                onChange={(e) =>
                  setForm((f) => ({ ...f, id: e.target.value.toLowerCase() }))
                }
              />
            </Form.Item>
          ) : null}
          <Form.Item label="名称" required>
            <Input
              value={form.name}
              maxLength={64}
              placeholder="显示名称"
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
            />
          </Form.Item>
          <Form.Item label="描述">
            <Input
              value={form.description}
              maxLength={200}
              placeholder="可选"
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </Form.Item>
          <Form.Item label="镜像" required>
            <Input
              value={form.image}
              maxLength={256}
              placeholder="例如 nginx:alpine"
              onChange={(e) =>
                setForm((f) => ({ ...f, image: e.target.value }))
              }
            />
          </Form.Item>
          <Form.Item label="端口">
            <InputNumber
              min={1}
              max={65535}
              value={form.port}
              style={{ width: 160 }}
              onChange={(v) =>
                setForm((f) => ({ ...f, port: Number(v) || 80 }))
              }
            />
          </Form.Item>
          <Form.Item label="默认规格" style={{ marginBottom: 0 }}>
            <ResourceConfig
              value={form.resources}
              onChange={(resources) =>
                setForm((f) => ({ ...f, resources }))
              }
              disabled={saving}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
