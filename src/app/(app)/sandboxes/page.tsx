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
    <main className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-ink">
            沙箱
          </h1>
          <p className="mt-2 text-sm text-muted">
            状态约每 5 秒自动刷新。点击「新建」配置算力并创建。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="font-mono text-xs text-muted">{sandboxes.length} 台</p>
          <Button onClick={openCreate}>新建</Button>
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        {loading ? (
          <p className="animate-pulse-dot px-5 py-12 text-sm text-muted">
            加载中…
          </p>
        ) : sandboxes.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-sm font-medium text-ink">还没有沙箱</p>
            <p className="mt-2 text-sm text-muted">
              点击「新建」配置算力并创建第一台。
            </p>
            <Button onClick={openCreate} className="mt-6">
              新建
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {sandboxes.map((sb) => (
              <li key={sb.id}>
                <Link
                  href={`/sandboxes/${sb.id}`}
                  className="group flex flex-col gap-3 px-5 py-4 transition duration-200 hover:bg-brand-soft/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-mono text-sm font-medium tracking-tight text-ink transition group-hover:text-brand-deep">
                      {sb.id}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {sb.publicUrl ?? "公网地址准备中…"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                    <span className="font-mono">
                      {sb.cpu} 核 · {memoryLabel(sb.memoryGi)} · {sb.diskGi}Gi
                    </span>
                    <StateBadge state={sb.state} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open ? (
        <Modal
          title="新建沙箱"
          titleId="create-sandbox-title"
          description={`${resources.cpu} 核 · ${memoryLabel(resources.memoryGi)} · ${resources.diskGi}Gi`}
          onClose={() => setOpen(false)}
          closeDisabled={creating}
          footer={
            <>
              <Button onClick={create} disabled={creating}>
                {creating ? "创建中…" : "立即创建"}
              </Button>
              <Button
                variant="secondary"
                disabled={creating}
                onClick={() => setOpen(false)}
              >
                取消
              </Button>
              {formError ? (
                <p className="text-sm text-danger">{formError}</p>
              ) : null}
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
