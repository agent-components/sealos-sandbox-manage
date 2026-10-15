"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ResourceConfig } from "@/components/ResourceConfig";
import { StateBadge } from "@/components/StateBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { boatClient } from "@/lib/client";
import type { Sandbox } from "@/lib/sandbox/schema";
import {
  DEFAULT_RESOURCES,
  memoryLabel,
  type ResourceSpec,
} from "@/lib/sealos/resources";

export default function SandboxesPage() {
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [resources, setResources] =
    useState<ResourceSpec>(DEFAULT_RESOURCES);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await boatClient.listSandboxes();
      setSandboxes(res.sandboxes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  function openCreate() {
    setResources(DEFAULT_RESOURCES);
    setFormError(null);
    setOpen(true);
  }

  async function create() {
    setCreating(true);
    setFormError(null);
    try {
      await boatClient.createSandbox(resources);
      setOpen(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">沙箱</h1>
          <p className="mt-1 text-sm text-gray-600">
            管理云端沙箱实例 · 状态每 5 秒刷新
          </p>
        </div>
        <Button onClick={openCreate}>新建沙箱</Button>
      </div>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <div className="overflow-hidden rounded-lg border border-gray-300">
        <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-gray-300 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_100px]">
          <span>名称</span>
          <span className="hidden sm:block">规格</span>
          <span className="hidden sm:block">状态</span>
          <span className="text-right tabular-nums">{sandboxes.length} 台</span>
        </div>

        {loading ? (
          <p className="px-4 py-10 text-sm text-gray-600">加载中…</p>
        ) : sandboxes.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm font-medium">还没有沙箱</p>
            <p className="mt-1 text-sm text-gray-600">
              创建第一台沙箱以开始使用
            </p>
            <Button onClick={openCreate} className="mt-5">
              新建沙箱
            </Button>
          </div>
        ) : (
          <ul>
            {sandboxes.map((sb, i) => (
              <li key={sb.id}>
                <Link
                  href={`/sandboxes/${sb.id}`}
                  className={`grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3.5 transition hover:bg-gray-50 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_100px] ${
                    i < sandboxes.length - 1 ? "border-b border-gray-300" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-medium">
                      {sb.id}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {sb.publicUrl ?? "公网地址准备中…"}
                    </p>
                  </div>
                  <p className="hidden font-mono text-xs text-gray-600 sm:block">
                    {sb.cpu} 核 · {memoryLabel(sb.memoryGi)} · {sb.diskGi}Gi
                  </p>
                  <div className="hidden sm:block">
                    <StateBadge state={sb.state} />
                  </div>
                  <div className="flex justify-end sm:hidden">
                    <StateBadge state={sb.state} />
                  </div>
                  <span className="hidden text-right text-xs text-gray-400 sm:block">
                    查看 →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open ? (
        <Modal
          title="新建沙箱"
          titleId="create-sandbox-title"
          description={`${resources.cpu} 核 · ${memoryLabel(resources.memoryGi)} · ${resources.diskGi}Gi`}
          onClose={() => setOpen(false)}
          closeDisabled={creating}
          footer={
            <>
              {formError ? (
                <p className="mr-auto text-sm text-danger">{formError}</p>
              ) : null}
              <Button
                variant="secondary"
                disabled={creating}
                onClick={() => setOpen(false)}
              >
                取消
              </Button>
              <Button onClick={create} disabled={creating}>
                {creating ? "创建中…" : "创建"}
              </Button>
            </>
          }
        >
          <ResourceConfig
            value={resources}
            onChange={setResources}
            disabled={creating}
          />
        </Modal>
      ) : null}
    </main>
  );
}
