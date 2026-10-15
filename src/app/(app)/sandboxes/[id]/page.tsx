"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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

export default function SandboxDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const [sandbox, setSandbox] = useState<Sandbox | null>(null);
  const [resources, setResources] =
    useState<ResourceSpec>(DEFAULT_RESOURCES);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await boatClient.getSandbox(id);
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
  }, [id]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
      if (action !== "delete") await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  const dirty =
    !!sandbox &&
    (resources.cpu !== sandbox.cpu ||
      resources.memoryGi !== sandbox.memoryGi ||
      resources.diskGi !== sandbox.diskGi);

  if (!sandbox && !error) {
    return (
      <p className="text-sm text-[var(--fg-muted)] animate-pulse-soft">
        加载中…
      </p>
    );
  }

  return (
    <main className="space-y-8">
      <div>
        <Link
          href="/sandboxes"
          className="text-sm text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
        >
          ← 返回沙箱列表
        </Link>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
            {id}
          </h1>
          {sandbox ? <StateBadge state={sandbox.state} /> : null}
        </div>
        {sandbox ? (
          <p className="mt-3 font-mono text-xs text-[var(--fg-muted)]">
            {sandbox.cpu} 核 · {memoryLabel(sandbox.memoryGi)} · {sandbox.diskGi}
            Gi
            {sandbox.image ? ` · ${sandbox.image}` : ""}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-[var(--danger)]">{error}</p>
      ) : null}

      {sandbox ? (
        <>
          <section className="surface space-y-4 rounded-2xl p-6">
            <h2 className="text-sm font-medium tracking-wide text-[var(--fg-muted)]">
              公网地址
            </h2>
            {sandbox.publicUrl ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href={sandbox.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-sm text-[var(--accent)] underline-offset-4 hover:underline"
                >
                  {sandbox.publicUrl}
                </a>
                <button
                  type="button"
                  className="btn-ghost !py-1.5 !px-3 text-xs"
                  onClick={() =>
                    void navigator.clipboard.writeText(sandbox.publicUrl!)
                  }
                >
                  复制
                </button>
              </div>
            ) : (
              <p className="text-sm text-[var(--fg-muted)]">
                尚未就绪，进入运行中后会自动出现。
              </p>
            )}
            <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
              容器内 API 请直连该地址。本控制台不代理命令执行。
            </p>
          </section>

          <section className="surface space-y-6 rounded-2xl p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium tracking-wide text-[var(--fg-muted)]">
                资源配置
              </h2>
              <span className="font-mono text-xs text-[var(--fg-muted)]">
                {resources.cpu} 核 · {memoryLabel(resources.memoryGi)} ·{" "}
                {resources.diskGi}Gi
              </span>
            </div>
            <ResourceConfig
              value={resources}
              onChange={setResources}
              disabled={busy !== null}
            />
            <button
              type="button"
              disabled={busy !== null || !dirty}
              onClick={() =>
                run("update", () => boatClient.updateSandbox(id, resources))
              }
              className="btn-primary"
            >
              {busy === "update" ? "更新中…" : "应用配置"}
            </button>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium tracking-wide text-[var(--fg-muted)]">
              生命周期
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run("stop", () => boatClient.stopSandbox(id))}
                className="btn-ghost"
              >
                {busy === "stop" ? "停止中…" : "停止"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  run("resume", () => boatClient.resumeSandbox(id))
                }
                className="btn-ghost"
              >
                {busy === "resume" ? "恢复中…" : "恢复"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void refresh()}
                className="btn-ghost"
              >
                刷新
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  run("delete", async () => {
                    if (!confirm(`确认删除 ${id}？`)) return;
                    await boatClient.deleteSandbox(id);
                    router.replace("/sandboxes");
                  })
                }
                className="btn-ghost !border-[rgba(214,69,93,0.4)] !text-[var(--danger)]"
              >
                {busy === "delete" ? "删除中…" : "删除"}
              </button>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
