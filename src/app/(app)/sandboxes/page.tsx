"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  App,
  Button,
  Empty,
  Flex,
  Input,
  Modal,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ResourceConfig } from "@/components/ResourceConfig";
import { SandboxDetailModal } from "@/components/SandboxDetailModal";
import { StateBadge } from "@/components/StateBadge";
import { boatClient } from "@/lib/client";
import type { Sandbox } from "@/lib/sandbox/schema";
import {
  DEFAULT_RESOURCES,
  memoryLabel,
  type ResourceSpec,
} from "@/lib/sealos/resources";

function canStop(state: Sandbox["state"]) {
  return state === "running" || state === "starting";
}

function canStart(state: Sandbox["state"]) {
  return state === "stopped" || state === "error";
}

export default function SandboxesPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [resources, setResources] =
    useState<ResourceSpec>(DEFAULT_RESOURCES);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sandbox | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const view = searchParams.get("view");
    if (view) {
      setViewId(view);
      router.replace("/sandboxes");
    }
  }, [router, searchParams]);

  const refresh = useCallback(async () => {
    try {
      const res = await boatClient.listSandboxes();
      setSandboxes(res.sandboxes);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  function openCreate() {
    setResources(DEFAULT_RESOURCES);
    setCreateOpen(true);
  }

  async function create() {
    setCreating(true);
    try {
      await boatClient.createSandbox(resources);
      setCreateOpen(false);
      message.success("沙箱已创建");
      await refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function runPower(sb: Sandbox) {
    setBusyId(sb.id);
    try {
      if (canStop(sb.state)) {
        await boatClient.stopSandbox(sb.id);
        message.success("已关机");
      } else {
        await boatClient.resumeSandbox(sb.id);
        message.success("已开机");
      }
      await refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteConfirm.trim() !== deleteTarget.id) {
      message.error("输入的 ID 与沙箱 ID 不一致");
      return;
    }
    setDeleting(true);
    try {
      await boatClient.deleteSandbox(deleteTarget.id);
      message.success("已删除");
      setDeleteTarget(null);
      setDeleteConfirm("");
      await refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  const columns: ColumnsType<Sandbox> = useMemo(
    () => [
      {
        title: "名称",
        dataIndex: "id",
        key: "id",
        render: (id: string) => (
          <Typography.Text strong style={{ fontFamily: "var(--font-mono)" }}>
            {id}
          </Typography.Text>
        ),
      },
      {
        title: "规格",
        key: "spec",
        width: 220,
        render: (_, sb) => (
          <Typography.Text type="secondary">
            {sb.cpu} 核 · {memoryLabel(sb.memoryGi)} · {sb.diskGi}Gi
          </Typography.Text>
        ),
      },
      {
        title: "状态",
        dataIndex: "state",
        key: "state",
        width: 120,
        render: (state: Sandbox["state"]) => <StateBadge state={state} />,
      },
      {
        title: "操作",
        key: "actions",
        width: 220,
        align: "right",
        render: (_, sb) => {
          const rowBusy = busyId === sb.id;
          const powerLabel = canStop(sb.state) ? "关机" : "开机";
          const powerDisabled =
            rowBusy ||
            deleting ||
            (!canStop(sb.state) && !canStart(sb.state));

          return (
            <Space size={0}>
              <Button
                type="link"
                size="small"
                style={{ paddingInline: 4 }}
                onClick={() => setViewId(sb.id)}
              >
                查看
              </Button>
              <Button
                type="link"
                size="small"
                style={{ paddingInline: 4 }}
                loading={rowBusy}
                disabled={powerDisabled && !rowBusy}
                onClick={() => void runPower(sb)}
              >
                {powerLabel}
              </Button>
              <Button
                type="link"
                size="small"
                danger
                style={{ paddingInline: 4 }}
                disabled={rowBusy || deleting}
                onClick={() => {
                  setDeleteTarget(sb);
                  setDeleteConfirm("");
                }}
              >
                删除
              </Button>
            </Space>
          );
        },
      },
    ],
    [busyId, deleting],
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
            沙箱
          </Typography.Title>
          <Typography.Text type="secondary">
            管理云端沙箱实例 · 状态每 5 秒刷新
          </Typography.Text>
        </div>
        <Button type="primary" onClick={openCreate}>
          新建沙箱
        </Button>
      </Flex>

      <Table<Sandbox>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={sandboxes}
        pagination={false}
        showSorterTooltip={false}
        style={{
          border: "1px solid #f0f0f0",
          borderRadius: 8,
          overflow: "hidden",
        }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有沙箱"
            >
              <Button type="primary" onClick={openCreate}>
                新建沙箱
              </Button>
            </Empty>
          ),
        }}
      />

      <Modal
        title="新建沙箱"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        centered
        destroyOnHidden
        width={560}
        styles={{ body: { minHeight: 280 } }}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
        onOk={() => void create()}
      >
        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          {resources.cpu} 核 · {memoryLabel(resources.memoryGi)} ·{" "}
          {resources.diskGi}Gi
        </Typography.Text>
        <ResourceConfig
          value={resources}
          onChange={setResources}
          disabled={creating}
        />
      </Modal>

      <SandboxDetailModal
        sandboxId={viewId ?? ""}
        open={!!viewId}
        onClose={() => setViewId(null)}
        onChanged={refresh}
      />

      <Modal
        title="删除沙箱"
        open={!!deleteTarget}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
            setDeleteConfirm("");
          }
        }}
        centered
        destroyOnHidden
        okText="确认删除"
        okButtonProps={{
          danger: true,
          disabled: !deleteTarget || deleteConfirm.trim() !== deleteTarget.id,
          loading: deleting,
        }}
        cancelButtonProps={{ disabled: deleting }}
        onOk={() => void confirmDelete()}
      >
        <Typography.Paragraph type="secondary">
          此操作不可恢复。请输入沙箱 ID{" "}
          <Typography.Text code>{deleteTarget?.id}</Typography.Text>{" "}
          以确认删除。
        </Typography.Paragraph>
        <Input
          autoFocus
          value={deleteConfirm}
          disabled={deleting}
          placeholder={deleteTarget?.id}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          onPressEnter={() => void confirmDelete()}
        />
      </Modal>
    </>
  );
}
