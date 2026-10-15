"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Card,
  Checkbox,
  Divider,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { ResourceConfig } from "@/components/ResourceConfig";
import { boatClient } from "@/lib/client";
import {
  DEFAULT_RESOURCES,
  memoryLabel,
  type ResourceSpec,
} from "@/lib/sealos/resources";
import type { Template } from "@/lib/template/schema";
import {
  defaultTemplatePorts,
  defaultTemplateStorage,
  primaryDiskGi,
} from "@/lib/template/schema";

type FormState = {
  id: string;
  name: string;
  description: string;
  image: string;
  privateImage: boolean;
  registryUsername: string;
  registryPassword: string;
  registryServer: string;
  command: string;
  argsText: string;
  resources: ResourceSpec;
  replicas: number;
  ports: Template["ports"];
  env: Template["env"];
  storage: Template["storage"];
};

const emptyForm = (): FormState => ({
  id: "",
  name: "",
  description: "",
  image: "",
  privateImage: false,
  registryUsername: "",
  registryPassword: "",
  registryServer: "",
  command: "",
  argsText: "",
  resources: { ...DEFAULT_RESOURCES },
  replicas: 1,
  ports: defaultTemplatePorts(),
  env: [],
  storage: defaultTemplateStorage(),
});

function fromTemplate(tpl: Template): FormState {
  return {
    id: tpl.id,
    name: tpl.name,
    description: tpl.description ?? "",
    image: tpl.image,
    privateImage: !!tpl.imageRegistry,
    registryUsername: tpl.imageRegistry?.username ?? "",
    registryPassword: tpl.imageRegistry?.password ?? "",
    registryServer: tpl.imageRegistry?.serverAddress ?? "",
    command: tpl.launchCommand?.command ?? "",
    argsText: (tpl.launchCommand?.args ?? []).join(" "),
    resources: {
      cpu: tpl.cpu,
      memoryGi: tpl.memoryGi,
      diskGi: primaryDiskGi(tpl.storage),
    },
    replicas: tpl.replicas ?? 1,
    ports: tpl.ports?.length ? tpl.ports : defaultTemplatePorts(),
    env: tpl.env ?? [],
    storage: tpl.storage?.length ? tpl.storage : defaultTemplateStorage(),
  };
}

function toPayload(form: FormState, editingId: string | null) {
  const args = form.argsText
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const storage =
    form.storage.length > 0
      ? form.storage.map((s, i) =>
          i === 0 ? { ...s, size: `${form.resources.diskGi}Gi` } : s,
        )
      : [{ name: "data", path: "/data", size: `${form.resources.diskGi}Gi` }];

  return {
    ...(editingId ? {} : { id: form.id.trim() }),
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    image: form.image.trim(),
    imageRegistry: form.privateImage
      ? {
          username: form.registryUsername.trim(),
          password: form.registryPassword,
          serverAddress: form.registryServer.trim(),
        }
      : null,
    launchCommand: {
      ...(form.command.trim() ? { command: form.command.trim() } : {}),
      ...(args.length ? { args } : {}),
    },
    cpu: form.resources.cpu,
    memoryGi: form.resources.memoryGi,
    replicas: form.replicas,
    ports: form.ports,
    env: form.env.filter((e) => e.name.trim()),
    storage,
  };
}

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
    setForm(fromTemplate(tpl));
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      message.error("请填写应用名称");
      return;
    }
    if (!form.image.trim()) {
      message.error("请填写镜像名");
      return;
    }
    if (form.privateImage) {
      if (
        !form.registryUsername.trim() ||
        !form.registryPassword ||
        !form.registryServer.trim()
      ) {
        message.error("私有镜像需填写仓库地址、用户名和密码");
        return;
      }
    }
    if (!form.ports.length) {
      message.error("至少配置一个网络端口");
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
      const payload = toPayload(form, editingId);
      if (editingId) {
        await boatClient.updateTemplate(editingId, payload);
        message.success("模板已更新");
      } else {
        await boatClient.createTemplate({
          id: form.id.trim(),
          ...payload,
        } as Template);
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
      content: `确认删除模板「${tpl.name}」（${tpl.id}）？`,
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
        width: 120,
        render: (id: string) => (
          <Typography.Text style={{ fontFamily: "var(--font-mono)" }}>
            {id}
          </Typography.Text>
        ),
      },
      { title: "名称", dataIndex: "name" },
      {
        title: "镜像",
        dataIndex: "image",
        ellipsis: true,
        render: (image: string) => (
          <Typography.Text type="secondary" ellipsis={{ tooltip: image }}>
            {image}
          </Typography.Text>
        ),
      },
      {
        title: "网络",
        key: "ports",
        width: 140,
        render: (_, tpl) => {
          const p = tpl.ports?.[0];
          return p
            ? `${p.number}/${p.protocol}${p.isPublic ? " · 公网" : ""}`
            : "—";
        },
      },
      {
        title: "资源",
        key: "spec",
        width: 180,
        render: (_, tpl) => (
          <Typography.Text type="secondary">
            {tpl.cpu} 核 · {memoryLabel(tpl.memoryGi)} ·{" "}
            {primaryDiskGi(tpl.storage)}Gi
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
            对齐 Sealos 应用管理参数；沙箱必须基于模板创建
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

      <Drawer
        title={editingId ? "编辑模板" : "新建模板"}
        open={open}
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        destroyOnHidden
        width={560}
        mask={{ closable: !saving }}
        styles={{ body: { paddingBottom: 24 } }}
        extra={
          <Space>
            <Button disabled={saving} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              部署配置
            </Button>
          </Space>
        }
      >
        <Form layout="vertical" disabled={saving}>
          <Typography.Title level={5}>基本信息</Typography.Title>
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
          ) : (
            <Form.Item label="模板 ID">
              <Input value={editingId} disabled />
            </Form.Item>
          )}
          <Form.Item label="显示名称" required>
            <Input
              value={form.name}
              maxLength={64}
              placeholder="模板显示名"
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
            />
          </Form.Item>
          <Form.Item label="描述">
            <Input.TextArea
              value={form.description}
              maxLength={200}
              rows={2}
              placeholder="可选"
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </Form.Item>

          <Divider />
          <Typography.Title level={5}>镜像</Typography.Title>
          <Form.Item label="镜像名" required extra="例如 nginx:alpine">
            <Input
              value={form.image}
              maxLength={256}
              placeholder="nginx:alpine"
              onChange={(e) =>
                setForm((f) => ({ ...f, image: e.target.value }))
              }
            />
          </Form.Item>
          <Form.Item label="私有镜像">
            <Switch
              checked={form.privateImage}
              onChange={(checked) =>
                setForm((f) => ({ ...f, privateImage: checked }))
              }
            />
          </Form.Item>
          {form.privateImage ? (
            <Card size="small" style={{ marginBottom: 16 }}>
              <Form.Item label="仓库地址" required>
                <Input
                  value={form.registryServer}
                  placeholder="registry.example.com"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, registryServer: e.target.value }))
                  }
                />
              </Form.Item>
              <Form.Item label="用户名" required>
                <Input
                  value={form.registryUsername}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      registryUsername: e.target.value,
                    }))
                  }
                />
              </Form.Item>
              <Form.Item label="密码 / Token" required style={{ marginBottom: 0 }}>
                <Input.Password
                  value={form.registryPassword}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      registryPassword: e.target.value,
                    }))
                  }
                />
              </Form.Item>
            </Card>
          ) : null}

          <Divider />
          <Typography.Title level={5}>运行命令</Typography.Title>
          <Form.Item label="Command" extra="对应 Sealos launchCommand.command">
            <Input
              value={form.command}
              placeholder="例如 node（可留空）"
              onChange={(e) =>
                setForm((f) => ({ ...f, command: e.target.value }))
              }
            />
          </Form.Item>
          <Form.Item
            label="Args"
            extra="空格分隔多个参数，对应 launchCommand.args"
          >
            <Input
              value={form.argsText}
              placeholder="例如 server.js --port 3000"
              onChange={(e) =>
                setForm((f) => ({ ...f, argsText: e.target.value }))
              }
            />
          </Form.Item>

          <Divider />
          <Typography.Title level={5}>资源配额</Typography.Title>
          <Form.Item label="实例数 (replicas)">
            <InputNumber
              min={1}
              max={20}
              value={form.replicas}
              style={{ width: 160 }}
              onChange={(v) =>
                setForm((f) => ({ ...f, replicas: Number(v) || 1 }))
              }
            />
          </Form.Item>
          <Form.Item label="CPU / 内存 / 本地存储" style={{ marginBottom: 0 }}>
            <ResourceConfig
              value={form.resources}
              onChange={(resources) =>
                setForm((f) => ({ ...f, resources }))
              }
              disabled={saving}
            />
          </Form.Item>

          <Divider />
          <Typography.Title level={5}>网络</Typography.Title>
          {form.ports.map((port, index) => (
            <Card
              key={index}
              size="small"
              style={{ marginBottom: 12 }}
              title={`容器端口 ${index + 1}`}
              extra={
                form.ports.length > 1 ? (
                  <Button
                    type="link"
                    danger
                    size="small"
                    icon={<MinusCircleOutlined />}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        ports: f.ports.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    删除
                  </Button>
                ) : null
              }
            >
              <Flex gap={12} wrap>
                <Form.Item label="端口号" style={{ marginBottom: 0 }}>
                  <InputNumber
                    min={1}
                    max={65535}
                    value={port.number}
                    onChange={(v) =>
                      setForm((f) => {
                        const ports = [...f.ports];
                        ports[index] = {
                          ...ports[index]!,
                          number: Number(v) || 80,
                        };
                        return { ...f, ports };
                      })
                    }
                  />
                </Form.Item>
                <Form.Item label="协议" style={{ marginBottom: 0 }}>
                  <Select
                    style={{ width: 120 }}
                    value={port.protocol}
                    options={[
                      { value: "http", label: "HTTP" },
                      { value: "grpc", label: "GRPC" },
                      { value: "ws", label: "WS" },
                      { value: "tcp", label: "TCP" },
                      { value: "udp", label: "UDP" },
                      { value: "sctp", label: "SCTP" },
                    ]}
                    onChange={(protocol) =>
                      setForm((f) => {
                        const ports = [...f.ports];
                        ports[index] = { ...ports[index]!, protocol };
                        return { ...f, ports };
                      })
                    }
                  />
                </Form.Item>
                <Form.Item label=" " style={{ marginBottom: 0 }}>
                  <Checkbox
                    checked={port.isPublic}
                    onChange={(e) =>
                      setForm((f) => {
                        const ports = [...f.ports];
                        ports[index] = {
                          ...ports[index]!,
                          isPublic: e.target.checked,
                        };
                        return { ...f, ports };
                      })
                    }
                  >
                    开启公网访问
                  </Checkbox>
                </Form.Item>
              </Flex>
            </Card>
          ))}
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            style={{ marginBottom: 16 }}
            onClick={() =>
              setForm((f) => ({
                ...f,
                ports: [
                  ...f.ports,
                  { number: 80, protocol: "http", isPublic: true },
                ],
              }))
            }
          >
            添加端口
          </Button>

          <Divider />
          <Typography.Title level={5}>本地存储</Typography.Title>
          {form.storage.map((item, index) => (
            <Card
              key={index}
              size="small"
              style={{ marginBottom: 12 }}
              title={`存储 ${index + 1}`}
              extra={
                form.storage.length > 1 ? (
                  <Button
                    type="link"
                    danger
                    size="small"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        storage: f.storage.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    删除
                  </Button>
                ) : null
              }
            >
              <Flex gap={12} wrap>
                <Form.Item label="名称" style={{ marginBottom: 0 }}>
                  <Input
                    value={item.name}
                    style={{ width: 120 }}
                    onChange={(e) =>
                      setForm((f) => {
                        const storage = [...f.storage];
                        storage[index] = {
                          ...storage[index]!,
                          name: e.target.value,
                        };
                        return { ...f, storage };
                      })
                    }
                  />
                </Form.Item>
                <Form.Item label="挂载路径" style={{ marginBottom: 0 }}>
                  <Input
                    value={item.path}
                    style={{ width: 160 }}
                    placeholder="/data"
                    onChange={(e) =>
                      setForm((f) => {
                        const storage = [...f.storage];
                        storage[index] = {
                          ...storage[index]!,
                          path: e.target.value,
                        };
                        return { ...f, storage };
                      })
                    }
                  />
                </Form.Item>
                <Form.Item label="容量" style={{ marginBottom: 0 }}>
                  <Input
                    value={item.size}
                    style={{ width: 100 }}
                    placeholder="3Gi"
                    disabled={index === 0}
                    onChange={(e) =>
                      setForm((f) => {
                        const storage = [...f.storage];
                        storage[index] = {
                          ...storage[index]!,
                          size: e.target.value,
                        };
                        return { ...f, storage };
                      })
                    }
                  />
                </Form.Item>
              </Flex>
              {index === 0 ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  首块存储容量由上方「本地存储」滑块同步（{form.resources.diskGi}
                  Gi）
                </Typography.Text>
              ) : null}
            </Card>
          ))}
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            style={{ marginBottom: 16 }}
            onClick={() =>
              setForm((f) => ({
                ...f,
                storage: [
                  ...f.storage,
                  {
                    name: `data-${f.storage.length + 1}`,
                    path: `/data${f.storage.length + 1}`,
                    size: "1Gi",
                  },
                ],
              }))
            }
          >
            添加存储
          </Button>

          <Divider />
          <Typography.Title level={5}>环境变量</Typography.Title>
          {form.env.map((item, index) => (
            <Flex key={index} gap={8} style={{ marginBottom: 8 }}>
              <Input
                placeholder="KEY"
                value={item.name}
                style={{ flex: 1 }}
                onChange={(e) =>
                  setForm((f) => {
                    const env = [...f.env];
                    env[index] = { ...env[index]!, name: e.target.value };
                    return { ...f, env };
                  })
                }
              />
              <Input
                placeholder="VALUE"
                value={item.value}
                style={{ flex: 1.4 }}
                onChange={(e) =>
                  setForm((f) => {
                    const env = [...f.env];
                    env[index] = { ...env[index]!, value: e.target.value };
                    return { ...f, env };
                  })
                }
              />
              <Button
                type="text"
                danger
                icon={<MinusCircleOutlined />}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    env: f.env.filter((_, i) => i !== index),
                  }))
                }
              />
            </Flex>
          ))}
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() =>
              setForm((f) => ({
                ...f,
                env: [...f.env, { name: "", value: "" }],
              }))
            }
          >
            添加环境变量
          </Button>
        </Form>
      </Drawer>
    </>
  );
}
