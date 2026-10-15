"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Modal, Space, Typography } from "antd";
import { ResourceConfig } from "@/components/ResourceConfig";
import { StateBadge } from "@/components/StateBadge";
import { boatClient } from "@/lib/client";
import type { Sandbox } from "@/lib/sandbox/schema";
import { memoryLabel, type ResourceSpec } from "@/lib/sealos/resources";

type Props = {
  sandboxId: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

export function SandboxDetailModal({
  sandboxId,
  open,
  onClose,
  onChanged,
}: Props) {
  const [sandbox, setSandbox] = useState<Sandbox | null>(null);
  const [resources, setResources] = useState<ResourceSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await boatClient.getSandbox(sandboxId);
      setSandbox(res.sandbox);
      setResources({
        cpu: res.sandbox.cpu,
        memoryGi: res.sandbox.memoryGi,
        diskGi: res.sandbox.diskGi,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }, [sandboxId]);

  useEffect(() => {
    if (!open) return;
    void load();
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load, open]);

  async function save() {
    if (!resources) return;
    setBusy("update");
    setError(null);
    try {
      await boatClient.updateSandbox(sandboxId, resources);
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  const dirty =
    !!sandbox &&
    !!resources &&
    (resources.cpu !== sandbox.cpu ||
      resources.memoryGi !== sandbox.memoryGi ||
      resources.diskGi !== sandbox.diskGi);

  return (
    <Modal
      title={
        <div className="pr-6">
          <div className="font-mono text-base">{sandboxId}</div>
          <div className="mt-1 font-mono text-xs font-normal text-gray-500">
            {sandbox
              ? `${sandbox.cpu} 核 · ${memoryLabel(sandbox.memoryGi)} · ${sandbox.diskGi}Gi${sandbox.image ? ` · ${sandbox.image}` : ""
              }`
              : "加载中…"}
          </div>
        </div>
      }
      open={open}
      onCancel={onClose}
      centered
      destroyOnHidden
      width={640}
      styles={{
        body: { minHeight: 360 },
      }}
      mask={{ closable: busy === null }}
      closable={busy === null}
      footer={
        <Space>
          <Button onClick={onClose} disabled={busy !== null}>
            关闭
          </Button>
          <Button
            type="primary"
            loading={busy === "update"}
            disabled={!dirty || !resources}
            onClick={() => void save()}
          >
            保存配置
          </Button>
        </Space>
      }
    >
      {error ? (
        <Typography.Text type="danger" className="mb-3 block">
          {error}
        </Typography.Text>
      ) : null}

      <div className="space-y-6">
        <div className="flex h-7 items-center gap-3">
          {sandbox ? (
            <>
              <StateBadge state={sandbox.state} />
              <span className="text-xs text-gray-500">状态约每 5 秒刷新</span>
            </>
          ) : (
            <span className="text-sm text-gray-500">加载中…</span>
          )}
        </div>

        <section className="space-y-2">
          <div className="text-sm font-medium">公网地址</div>
          <div className="min-h-[40px]">
            {sandbox?.publicUrl ? (
              <Space wrap>
                <Typography.Link
                  href={sandbox.publicUrl}
                  target="_blank"
                  className="font-mono"
                >
                  {sandbox.publicUrl}
                </Typography.Link>
                <Button
                  size="small"
                  onClick={() =>
                    void navigator.clipboard.writeText(sandbox.publicUrl!)
                  }
                >
                  复制
                </Button>
              </Space>
            ) : (
              <span className="text-sm text-gray-500">
                {sandbox ? "尚未就绪，进入运行中后会自动出现" : "…"}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            容器内 API 请直连该地址。本控制台不代理命令执行。
          </div>
        </section>

        <section className="space-y-3">
          <div className="text-sm font-medium">资源配置</div>
          {resources ? (
            <ResourceConfig
              value={resources}
              onChange={setResources}
              disabled={busy !== null}
            />
          ) : (
            <div className="h-[220px] animate-pulse rounded-md bg-gray-100" />
          )}
        </section>
      </div>
    </Modal>
  );
}
