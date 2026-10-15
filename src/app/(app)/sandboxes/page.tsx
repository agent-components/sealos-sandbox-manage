"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ResourceConfig } from "@/components/ResourceConfig";
import { StateBadge } from "@/components/StateBadge";
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

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !creating) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, creating]);

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
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">沙箱</h1>
          <p className="mt-2 text-sm text-[var(--fg-muted)]">
            状态约每 5 秒自动刷新。点击「新建」配置算力并创建。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="font-mono text-xs text-[var(--fg-muted)]">
            {sandboxes.length} 台
          </p>
          <button type="button" onClick={openCreate} className="btn-primary">
            新建
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-[var(--danger)]">{error}</p>
      ) : null}

      <section>
        <div className="border-t border-[var(--border)]">
          {loading ? (
            <p className="py-10 text-sm text-[var(--fg-muted)] animate-pulse-soft">
              加载中…
            </p>
          ) : sandboxes.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-sm text-[var(--fg)]">还没有沙箱</p>
              <p className="mt-2 text-sm text-[var(--fg-muted)]">
                点击「新建」配置算力并创建第一台。
              </p>
              <button
                type="button"
                onClick={openCreate}
                className="btn-primary mt-6"
              >
                新建
              </button>
            </div>
          ) : (
            sandboxes.map((sb) => (
              <Link
                key={sb.id}
                href={`/sandboxes/${sb.id}`}
                className="sandbox-row"
              >
                <div className="min-w-0 space-y-1.5">
                  <p className="font-mono text-sm font-medium tracking-tight">
                    {sb.id}
                  </p>
                  <p className="truncate text-xs text-[var(--fg-muted)]">
                    {sb.publicUrl ?? "公网地址准备中…"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--fg-muted)]">
                  <span className="font-mono">
                    {sb.cpu} 核 · {memoryLabel(sb.memoryGi)} · {sb.diskGi}Gi
                  </span>
                  <StateBadge state={sb.state} />
                </div>
              </Link>
            ))
          )}
        </div>
      </section>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(19,32,43,0.35)] p-4 backdrop-blur-[2px] sm:items-center"
          onClick={() => {
            if (!creating) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-sandbox-title"
            className="surface animate-rise w-full max-w-xl rounded-2xl p-6 shadow-[0_20px_60px_rgba(19,32,43,0.16)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="create-sandbox-title"
                  className="text-lg font-semibold tracking-tight"
                >
                  新建沙箱
                </h2>
                <p className="mt-1 font-mono text-xs text-[var(--fg-muted)]">
                  {resources.cpu} 核 · {memoryLabel(resources.memoryGi)} ·{" "}
                  {resources.diskGi}Gi
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost !px-2.5 !py-1 text-sm"
                disabled={creating}
                onClick={() => setOpen(false)}
              >
                关闭
              </button>
            </div>

            <ResourceConfig
              value={resources}
              onChange={setResources}
              disabled={creating}
            />

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={create}
                disabled={creating}
                className="btn-primary"
              >
                {creating ? "创建中…" : "立即创建"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={creating}
                onClick={() => setOpen(false)}
              >
                取消
              </button>
              {formError ? (
                <p className="text-sm text-[var(--danger)]">{formError}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
