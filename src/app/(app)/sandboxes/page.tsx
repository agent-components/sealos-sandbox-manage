"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  App,
  Button,
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

  useEffect(() => {
    const view = searchParams.get("view");
    if (view) {
      setViewId(view);
      router.replace("/sandboxes");
    }
  }, [router, searchParams]);
  const [deleteTarget, setDeleteTarget] = useState<Sandbox | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

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
        render: (_, sb) => (
          <div className="min-w-0">
            <div className="font-mono text-sm font-medium">{sb.id}</div>
            <div className="truncate text-xs text-gray-500">
              {sb.publicUrl ?? "公网地址准备中…"}
            </div>
          </div>
        ),
      },
      {
        title: "规格",
        key: "spec",
        width: 180,
        render: (_, sb) => (
          <span className="font-mono text-xs text-gray-600">
            {sb.cpu} 核 · {memoryLabel(sb.memoryGi)} · {sb.diskGi}Gi
          </span>
        ),
      },
      {
        title: "状态",
        dataIndex: "state",
        key: "state",
        width: 100,
        render: (state: Sandbox["state"]) => <StateBadge state={state} />,
      },
      {
        title: "操作",
        key: "actions",
        width: 260,
        align: "right",
        render: (_, sb) => {
          const rowBusy = busyId === sb.id;
          const powerLabel = canStop(sb.state) ? "关机" : "开机";
          const powerDisabled =
            rowBusy ||
            deleting ||
            (!canStop(sb.state) && !canStart(sb.state));

          return (
            <Space size={8} wrap>
              <Button size="small" onClick={() => setViewId(sb.id)}>
                查看
              </Button>
              <Button
                size="small"
                loading={rowBusy}
                disabled={powerDisabled && !rowBusy}
                onClick={() => void runPower(sb)}
              >
                {powerLabel}
              </Button>
              <Button
                size="small"
                danger
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
    <main>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">沙箱</h1>
          <p className="mt-1 text-sm text-gray-600">
            管理云端沙箱实例 · 状态每 5 秒刷新
          </p>
        </div>
        <Button type="primary" onClick={openCreate}>
          新建沙箱
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={sandboxes}
        pagination={false}
        locale={{ emptyText: "还没有沙箱，点击右上角新建" }}
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
        <div className="mb-4 font-mono text-xs text-gray-500">
          {resources.cpu} 核 · {memoryLabel(resources.memoryGi)} ·{" "}
          {resources.diskGi}Gi
        </div>
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
    </main>
  );
}
