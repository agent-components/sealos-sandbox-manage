"use client";

import { useEffect, useState } from "react";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  sandboxClient,
  type BillingPrices,
  type RegionAdmin,
} from "@/lib/client";

const DEFAULT_PRICES: BillingPrices = {
  cpu: 0.01742,
  memory: 0.008786,
  storage: 0.000532,
  port: 0.007,
};

function formatTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function ClusterSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { message, modal } = App.useApp();
  const [list, setList] = useState<RegionAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<RegionAdmin | null>(null);
  const [saving, setSaving] = useState(false);
  const [launchpadBase, setLaunchpadBase] = useState("");
  const [kubeconfig, setKubeconfig] = useState("");
  const [prices, setPrices] = useState<BillingPrices>(DEFAULT_PRICES);

  async function load() {
    setLoading(true);
    try {
      const res = await sandboxClient.listAdminRegions();
      setList(res.list);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function openEdit(region: RegionAdmin) {
    setEditing(region);
    setLaunchpadBase(region.launchpadBase ?? "");
    setKubeconfig("");
    setPrices(region.prices ?? { ...DEFAULT_PRICES });
  }

  async function save() {
    if (!editing) return;
    const base = launchpadBase.trim();
    if (!base) {
      message.error("请填写 Launchpad 地址");
      return;
    }
    if (!editing.configured && !kubeconfig.trim()) {
      message.error("请提供 kubeconfig");
      return;
    }
    setSaving(true);
    try {
      await sandboxClient.upsertAdminRegion(editing.id, {
        launchpadBase: base,
        kubeconfig: kubeconfig.trim() || null,
        prices,
      });
      message.success("已保存");
      setEditing(null);
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(region: RegionAdmin) {
    try {
      await sandboxClient.setDefaultAdminRegion(region.id);
      message.success(`已将「${region.name}」设为默认区域`);
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "设置失败");
    }
  }

  function clearRegion(region: RegionAdmin) {
    modal.confirm({
      title: `清空「${region.name}」凭证？`,
      content: "清空后该区域将不可用于创建沙箱；仍有沙箱占用时无法清空。单价会保留。",
      okText: "清空",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await sandboxClient.clearAdminRegion(region.id);
          message.success("已清空");
          await load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : "清空失败");
          throw err;
        }
      },
    });
  }

  return (
    <>
      <Modal
        title="集群设置"
        open={open}
        onCancel={onClose}
        footer={null}
        width={780}
        centered
        destroyOnHidden
      >
        <Table<RegionAdmin>
          rowKey="id"
          loading={loading}
          dataSource={list}
          pagination={false}
          size="middle"
          columns={[
            {
              title: "区域",
              key: "name",
              render: (_, row) => (
                <Space size={8}>
                  <Typography.Text strong>{row.name}</Typography.Text>
                  <Typography.Text
                    type="secondary"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                  >
                    {row.id}
                  </Typography.Text>
                  {row.isDefault ? <Tag color="blue">默认</Tag> : null}
                </Space>
              ),
            },
            {
              title: "凭证",
              key: "configured",
              width: 88,
              render: (_, row) =>
                row.configured ? (
                  <Tag color="success">已配置</Tag>
                ) : (
                  <Tag>未配置</Tag>
                ),
            },
            {
              title: "CPU 单价",
              key: "priceCpu",
              width: 100,
              render: (_, row) => (
                <Typography.Text
                  type="secondary"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                >
                  {row.prices.cpu}
                </Typography.Text>
              ),
            },
            {
              title: "更新时间",
              dataIndex: "updatedAt",
              width: 150,
              render: (value: string | null) => (
                <Typography.Text type="secondary">
                  {formatTime(value)}
                </Typography.Text>
              ),
            },
            {
              title: "操作",
              key: "actions",
              width: 200,
              align: "right",
              render: (_, row) => (
                <Space size={0}>
                  <Button
                    type="link"
                    size="small"
                    style={{ paddingInline: 4 }}
                    onClick={() => openEdit(row)}
                  >
                    配置
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    style={{ paddingInline: 4 }}
                    disabled={!row.configured || row.isDefault}
                    onClick={() => void setDefault(row)}
                  >
                    设为默认
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    danger
                    style={{ paddingInline: 4 }}
                    disabled={!row.configured}
                    onClick={() => clearRegion(row)}
                  >
                    清空
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        title={editing ? `配置区域 · ${editing.name}` : "配置区域"}
        open={Boolean(editing)}
        onCancel={() => {
          if (!saving) setEditing(null);
        }}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        cancelButtonProps={{ disabled: saving }}
        width={640}
        centered
        destroyOnHidden
      >
        <Form layout="vertical" disabled={saving}>
          <Form.Item label="Launchpad 地址" required>
            <Input
              value={launchpadBase}
              placeholder="https://applaunchpad.gzg.sealos.run"
              onChange={(e) => setLaunchpadBase(e.target.value)}
            />
          </Form.Item>
          <Form.Item
            label="kubeconfig"
            required={!editing?.configured}
            extra={
              editing?.configured
                ? "已配置凭证。留空则保留原内容，粘贴新内容则覆盖。"
                : "粘贴完整 kubeconfig YAML"
            }
          >
            <Input.TextArea
              value={kubeconfig}
              rows={8}
              placeholder={
                editing?.configured
                  ? "留空则保留原凭证"
                  : "apiVersion: v1\nclusters: ..."
              }
              style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
              onChange={(e) => setKubeconfig(e.target.value)}
            />
          </Form.Item>
          <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
            用量单价（元）
          </Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            写入用量段时快照；改价不影响已发生费用。
          </Typography.Paragraph>
          <Space wrap size={16} style={{ width: "100%", marginBottom: 8 }}>
            <Form.Item label="CPU（元/核·小时）" style={{ marginBottom: 0 }}>
              <InputNumber
                min={0}
                step={0.00001}
                value={prices.cpu}
                style={{ width: 140 }}
                onChange={(value) =>
                  setPrices((prev) => ({
                    ...prev,
                    cpu: typeof value === "number" ? value : prev.cpu,
                  }))
                }
              />
            </Form.Item>
            <Form.Item label="内存（元/GB·小时）" style={{ marginBottom: 0 }}>
              <InputNumber
                min={0}
                step={0.00001}
                value={prices.memory}
                style={{ width: 140 }}
                onChange={(value) =>
                  setPrices((prev) => ({
                    ...prev,
                    memory: typeof value === "number" ? value : prev.memory,
                  }))
                }
              />
            </Form.Item>
            <Form.Item label="存储（元/GB·小时）" style={{ marginBottom: 0 }}>
              <InputNumber
                min={0}
                step={0.00001}
                value={prices.storage}
                style={{ width: 140 }}
                onChange={(value) =>
                  setPrices((prev) => ({
                    ...prev,
                    storage: typeof value === "number" ? value : prev.storage,
                  }))
                }
              />
            </Form.Item>
            <Form.Item label="公网端口（元/个·小时）" style={{ marginBottom: 0 }}>
              <InputNumber
                min={0}
                step={0.00001}
                value={prices.port}
                style={{ width: 140 }}
                onChange={(value) =>
                  setPrices((prev) => ({
                    ...prev,
                    port: typeof value === "number" ? value : prev.port,
                  }))
                }
              />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
}
