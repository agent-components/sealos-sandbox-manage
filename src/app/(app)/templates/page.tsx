"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
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
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined } from "@ant-design/icons";
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
  formatSizeGi,
  parseSizeToGi,
  primaryDiskGi,
} from "@/lib/template/schema";

type FormState = {
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
  configMap: Template["configMap"];
};

const emptyForm = (): FormState => ({
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
  storage: [],
  configMap: [],
});

function fromTemplate(tpl: Template): FormState {
  return {
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
    storage: tpl.storage ?? [],
    configMap: tpl.configMap ?? [],
  };
}

function toPayload(form: FormState) {
  const args = form.argsText
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
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
    storage: form.storage.filter((s) => s.name.trim() && s.path.trim()),
    configMap: form.configMap
      .filter((c) => c.path.trim())
      .map((c) => ({ path: c.path.trim(), value: c.value ?? "" })),
  };
}

export default function TemplatesPage() {
  const { message, modal } = App.useApp();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
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
    setActiveTab("basic");
    setOpen(true);
  }

  function openEdit(tpl: Template) {
    setEditingId(tpl.id);
    setForm(fromTemplate(tpl));
    setActiveTab("basic");
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      setActiveTab("basic");
      message.error("请填写显示名称");
      return;
    }
    if (!form.image.trim()) {
      setActiveTab("image");
      message.error("请填写镜像名");
      return;
    }
    if (form.privateImage) {
      if (
        !form.registryUsername.trim() ||
        !form.registryPassword ||
        !form.registryServer.trim()
      ) {
        setActiveTab("image");
        message.error("私有镜像需填写仓库地址、用户名和密码");
        return;
      }
    }
    if (!form.ports.length) {
      setActiveTab("network");
      message.error("至少配置一个网络端口");
      return;
    }

    setSaving(true);
    try {
      const payload = toPayload(form);
      if (editingId) {
        await boatClient.updateTemplate(editingId, payload);
        message.success("模板已更新");
      } else {
        await boatClient.createTemplate(payload);
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
        width: 180,
        fixed: "left",
        render: (id: string) => (
          <Typography.Text style={{ fontFamily: "var(--font-mono)" }}>
            {id}
          </Typography.Text>
        ),
      },
      { title: "名称", dataIndex: "name", width: 160 },
      {
        title: "镜像",
        dataIndex: "image",
        width: 280,
        render: (image: string) => (
          <Typography.Text
            type="secondary"
            style={{ fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}
          >
            {image}
          </Typography.Text>
        ),
      },
      {
        title: "网络",
        key: "ports",
        width: 180,
        render: (_, tpl) => {
          const ports = tpl.ports ?? [];
          if (!ports.length) return "—";
          const formatPort = (p: (typeof ports)[number]) =>
            `${p.number}/${p.protocol}${p.isPublic ? " · 公网" : ""}`;
          const first = ports[0]!;
          const rest = ports.slice(1);
          return (
            <Flex align="center" gap={6} wrap={false}>
              <Typography.Text style={{ fontSize: 13 }} ellipsis>
                {formatPort(first)}
              </Typography.Text>
              {rest.length > 0 ? (
                <Tooltip
                  title={
                    <div style={{ whiteSpace: "pre-line" }}>
                      {rest.map(formatPort).join("\n")}
                    </div>
                  }
                >
                  <Tag style={{ marginInlineEnd: 0, cursor: "default" }}>
                    +{rest.length}
                  </Tag>
                </Tooltip>
              ) : null}
            </Flex>
          );
        },
      },
      {
        title: "资源",
        key: "spec",
        width: 160,
        render: (_, tpl) => (
          <Typography.Text type="secondary">
            {tpl.cpu} 核 · {memoryLabel(tpl.memoryGi)}
            {tpl.replicas > 1 ? ` · ×${tpl.replicas}` : ""}
          </Typography.Text>
        ),
      },
      {
        title: "操作",
        key: "actions",
        width: 140,
        align: "right",
        fixed: "right",
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
        scroll={{ x: 1100 }}
        style={{
          border: "1px solid #f0f0f0",
          borderRadius: 8,
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
        className="template-drawer"
        title={editingId ? "编辑模板" : "新建模板"}
        open={open}
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        destroyOnHidden
        width={880}
        mask={{ closable: !saving }}
        styles={{
          body: { padding: "0 24px 24px 0" },
        }}
        extra={
          <Space>
            <Button disabled={saving} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form
          layout="horizontal"
          disabled={saving}
          labelCol={{ flex: "96px" }}
          wrapperCol={{ flex: 1 }}
          labelAlign="right"
          colon={false}
        >
          <Tabs
            className="template-drawer-tabs"
            tabPosition="left"
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: "basic",
                label: "基本信息",
                children: (
                  <div
                    className="template-drawer-panel"
                    style={{ paddingTop: 24 }}
                  >
                    {editingId ? (
                      <Form.Item label="模板 ID">
                        <Input value={editingId} disabled />
                      </Form.Item>
                    ) : null}
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
                        rows={3}
                        placeholder="可选"
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            description: e.target.value,
                          }))
                        }
                      />
                    </Form.Item>
                  </div>
                ),
              },
              {
                key: "image",
                label: "镜像",
                children: (
                  <div
                    className="template-drawer-panel"
                    style={{ paddingTop: 24 }}
                  >
                    <Form.Item label="镜像名" required>
                      <Input
                        value={form.image}
                        maxLength={256}
                        placeholder="nginx:alpine"
                        onChange={(e) =>
                          setForm((f) => ({ ...f, image: e.target.value }))
                        }
                      />
                    </Form.Item>
                    <Form.Item
                      label="私有镜像"
                      style={{ marginBottom: form.privateImage ? 20 : 0 }}
                    >
                      <Switch
                        checked={form.privateImage}
                        onChange={(checked) =>
                          setForm((f) => ({ ...f, privateImage: checked }))
                        }
                      />
                    </Form.Item>
                    {form.privateImage ? (
                      <>
                        <Form.Item label="仓库地址" required>
                          <Input
                            value={form.registryServer}
                            placeholder="registry.example.com"
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                registryServer: e.target.value,
                              }))
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
                        <Form.Item label="密码 / Token" required>
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
                      </>
                    ) : null}
                  </div>
                ),
              },
              {
                key: "command",
                label: "运行命令",
                children: (
                  <div
                    className="template-drawer-panel"
                    style={{ paddingTop: 24 }}
                  >
                    <Form.Item label="Command">
                      <Input
                        value={form.command}
                        placeholder="node（可留空）"
                        onChange={(e) =>
                          setForm((f) => ({ ...f, command: e.target.value }))
                        }
                      />
                    </Form.Item>
                    <Form.Item label="Args">
                      <Input
                        value={form.argsText}
                        placeholder="server.js --port 3000"
                        onChange={(e) =>
                          setForm((f) => ({ ...f, argsText: e.target.value }))
                        }
                      />
                    </Form.Item>
                  </div>
                ),
              },
              {
                key: "resources",
                label: "资源配额",
                children: (
                  <div
                    className="template-drawer-panel"
                    style={{ paddingTop: 24 }}
                  >
                    <Form.Item label="实例数">
                      <InputNumber
                        min={1}
                        max={20}
                        value={form.replicas}
                        addonAfter="个"
                        style={{ width: 140 }}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            replicas: Number(v) || 1,
                          }))
                        }
                      />
                    </Form.Item>
                    <div style={{ marginTop: 8 }}>
                      <ResourceConfig
                        value={form.resources}
                        onChange={(resources) =>
                          setForm((f) => ({ ...f, resources }))
                        }
                        disabled={saving}
                        showDisk={false}
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: "network",
                label: "网络",
                children: (
                  <div
                    className="template-drawer-panel is-wide"
                    style={{ paddingTop: 24 }}
                  >
                    <Table
                      className="template-drawer-edit-table"
                      size="small"
                      pagination={false}
                      rowKey={(_, index) => `port-${index}`}
                      dataSource={form.ports}
                      columns={[
                        {
                          title: "端口号",
                          dataIndex: "number",
                          width: 120,
                          render: (value, _, index) => (
                            <InputNumber
                              min={1}
                              max={65535}
                              value={value}
                              style={{ width: "100%" }}
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
                          ),
                        },
                        {
                          title: "协议",
                          dataIndex: "protocol",
                          width: 130,
                          render: (value, _, index) => (
                            <Select
                              style={{ width: "100%" }}
                              value={value}
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
                                  ports[index] = {
                                    ...ports[index]!,
                                    protocol,
                                  };
                                  return { ...f, ports };
                                })
                              }
                            />
                          ),
                        },
                        {
                          title: "公网访问",
                          dataIndex: "isPublic",
                          width: 100,
                          align: "center",
                          render: (value, _, index) => (
                            <Switch
                              size="small"
                              checked={value}
                              onChange={(checked) =>
                                setForm((f) => {
                                  const ports = [...f.ports];
                                  ports[index] = {
                                    ...ports[index]!,
                                    isPublic: checked,
                                  };
                                  return { ...f, ports };
                                })
                              }
                            />
                          ),
                        },
                        {
                          title: "",
                          key: "action",
                          width: 64,
                          align: "right",
                          render: (_, __, index) => (
                            <Button
                              type="link"
                              danger
                              size="small"
                              disabled={form.ports.length <= 1}
                              style={{ paddingInline: 0 }}
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  ports: f.ports.filter((_, i) => i !== index),
                                }))
                              }
                            >
                              删除
                            </Button>
                          ),
                        },
                      ]}
                    />
                    <Button
                      type="dashed"
                      block
                      icon={<PlusOutlined />}
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
                  </div>
                ),
              },
              {
                key: "storage",
                label: "本地存储",
                children: (
                  <div
                    className="template-drawer-panel is-wide"
                    style={{ paddingTop: 24 }}
                  >
                    <Table
                      className="template-drawer-edit-table"
                      size="small"
                      pagination={false}
                      rowKey={(_, index) => `storage-${index}`}
                      dataSource={form.storage}
                      columns={[
                        {
                          title: "名称",
                          dataIndex: "name",
                          width: 140,
                          render: (value, _, index) => (
                            <Input
                              value={value}
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
                          ),
                        },
                        {
                          title: "挂载路径",
                          dataIndex: "path",
                          render: (value, _, index) => (
                            <Input
                              value={value}
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
                          ),
                        },
                        {
                          title: "容量",
                          dataIndex: "size",
                          width: 140,
                          render: (value, _, index) => (
                            <InputNumber
                              min={1}
                              max={1000}
                              step={1}
                              value={parseSizeToGi(value)}
                              addonAfter="Gi"
                              style={{ width: "100%" }}
                              onChange={(v) =>
                                setForm((f) => {
                                  const storage = [...f.storage];
                                  storage[index] = {
                                    ...storage[index]!,
                                    size: formatSizeGi(Number(v) || 1),
                                  };
                                  return { ...f, storage };
                                })
                              }
                            />
                          ),
                        },
                        {
                          title: "",
                          key: "action",
                          width: 64,
                          align: "right",
                          render: (_, __, index) => (
                            <Button
                              type="link"
                              danger
                              size="small"
                              style={{ paddingInline: 0 }}
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  storage: f.storage.filter(
                                    (_, i) => i !== index,
                                  ),
                                }))
                              }
                            >
                              删除
                            </Button>
                          ),
                        },
                      ]}
                    />
                    <Button
                      type="dashed"
                      block
                      icon={<PlusOutlined />}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          storage: [
                            ...f.storage,
                            {
                              name:
                                f.storage.length === 0
                                  ? "data"
                                  : `data-${f.storage.length + 1}`,
                              path:
                                f.storage.length === 0
                                  ? "/data"
                                  : `/data${f.storage.length + 1}`,
                              size: "1Gi",
                            },
                          ],
                        }))
                      }
                    >
                      添加存储
                    </Button>
                  </div>
                ),
              },
              {
                key: "configMap",
                label: "ConfigMap",
                children: (
                  <div
                    className="template-drawer-panel is-wide"
                    style={{ paddingTop: 24 }}
                  >
                    <Space
                      direction="vertical"
                      size={12}
                      style={{ width: "100%" }}
                    >
                      {form.configMap.map((item, index) => (
                        <div
                          key={index}
                          style={{
                            border: "1px solid #f0f0f0",
                            borderRadius: 8,
                            padding: 12,
                          }}
                        >
                          <Flex
                            align="center"
                            justify="space-between"
                            gap={12}
                            style={{ marginBottom: 10 }}
                          >
                            <Input
                              value={item.path}
                              placeholder="挂载路径，如 /etc/nginx/nginx.conf"
                              onChange={(e) =>
                                setForm((f) => {
                                  const configMap = [...f.configMap];
                                  configMap[index] = {
                                    ...configMap[index]!,
                                    path: e.target.value,
                                  };
                                  return { ...f, configMap };
                                })
                              }
                            />
                            <Button
                              type="link"
                              danger
                              size="small"
                              style={{ paddingInline: 0, flexShrink: 0 }}
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  configMap: f.configMap.filter(
                                    (_, i) => i !== index,
                                  ),
                                }))
                              }
                            >
                              删除
                            </Button>
                          </Flex>
                          <Input.TextArea
                            value={item.value}
                            rows={6}
                            placeholder="文件内容"
                            style={{ fontFamily: "var(--font-mono)" }}
                            onChange={(e) =>
                              setForm((f) => {
                                const configMap = [...f.configMap];
                                configMap[index] = {
                                  ...configMap[index]!,
                                  value: e.target.value,
                                };
                                return { ...f, configMap };
                              })
                            }
                          />
                        </div>
                      ))}
                      {form.configMap.length === 0 ? (
                        <Typography.Text type="secondary">
                          暂无 ConfigMap
                        </Typography.Text>
                      ) : null}
                      <Button
                        type="dashed"
                        block
                        icon={<PlusOutlined />}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            configMap: [
                              ...f.configMap,
                              { path: "", value: "" },
                            ],
                          }))
                        }
                      >
                        添加 ConfigMap
                      </Button>
                    </Space>
                  </div>
                ),
              },
              {
                key: "env",
                label: "环境变量",
                children: (
                  <div
                    className="template-drawer-panel is-wide"
                    style={{ paddingTop: 24 }}
                  >
                    <Table
                      className="template-drawer-edit-table"
                      size="small"
                      pagination={false}
                      rowKey={(_, index) => `env-${index}`}
                      dataSource={form.env}
                      locale={{ emptyText: "暂无环境变量" }}
                      columns={[
                        {
                          title: "变量名",
                          dataIndex: "name",
                          width: "36%",
                          render: (value, _, index) => (
                            <Input
                              value={value}
                              placeholder="KEY"
                              onChange={(e) =>
                                setForm((f) => {
                                  const env = [...f.env];
                                  env[index] = {
                                    ...env[index]!,
                                    name: e.target.value,
                                  };
                                  return { ...f, env };
                                })
                              }
                            />
                          ),
                        },
                        {
                          title: "值",
                          dataIndex: "value",
                          render: (value, _, index) => (
                            <Input
                              value={value}
                              placeholder="VALUE"
                              onChange={(e) =>
                                setForm((f) => {
                                  const env = [...f.env];
                                  env[index] = {
                                    ...env[index]!,
                                    value: e.target.value,
                                  };
                                  return { ...f, env };
                                })
                              }
                            />
                          ),
                        },
                        {
                          title: "",
                          key: "action",
                          width: 64,
                          align: "right",
                          render: (_, __, index) => (
                            <Button
                              type="link"
                              danger
                              size="small"
                              style={{ paddingInline: 0 }}
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  env: f.env.filter((_, i) => i !== index),
                                }))
                              }
                            >
                              删除
                            </Button>
                          ),
                        },
                      ]}
                    />
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
                  </div>
                ),
              },
            ]}
          />
        </Form>
      </Drawer>
    </>
  );
}
