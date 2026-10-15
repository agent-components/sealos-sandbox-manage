"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ResourceConfig } from "@/components/ResourceConfig";
import { StateBadge } from "@/components/StateBadge";
import { Button } from "@/components/ui/Button";
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
      <p className="animate-pulse-dot text-[15px] text-muted">加载中…</p>
    );
  }

  return (
    <main className="space-y-8">
      <div>
        <Link
          href="/sandboxes"
          className="inline-flex items-center gap-1 text-[15px] text-brand transition hover:opacity-80"
        >
          ‹ 沙箱
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]">
            {id}
          </h1>
          {sandbox ? <StateBadge state={sandbox.state} /> : null}
        </div>
        {sandbox ? (
          <p className="mt-2 font-mono text-[14px] text-muted">
            {sandbox.cpu} 核 · {memoryLabel(sandbox.memoryGi)} · {sandbox.diskGi}
            Gi
            {sandbox.image ? ` · ${sandbox.image}` : ""}
          </p>
        ) : null}
      </div>

      {error ? <p className="text-[15px] text-danger">{error}</p> : null}

      {sandbox ? (
        <>
          <section>
            <p className="mb-2 px-1 text-[13px] font-medium uppercase tracking-wide text-muted">
              公网地址
            </p>
            <div className="panel space-y-3 px-5 py-5">
              {sandbox.publicUrl ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <a
                    href={sandbox.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-mono text-[15px] text-brand hover:underline"
                  >
                    {sandbox.publicUrl}
                  </a>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      void navigator.clipboard.writeText(sandbox.publicUrl!)
                    }
                  >
                    复制
                  </Button>
                </div>
              ) : (
                <p className="text-[15px] text-muted">
                  尚未就绪，进入运行中后会自动出现
                </p>
              )}
              <p className="text-[13px] leading-relaxed text-muted">
                容器内 API 请直连该地址。本控制台不代理命令执行。
              </p>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[13px] font-medium uppercase tracking-wide text-muted">
                资源配置
              </p>
              <span className="font-mono text-[12px] text-muted">
                {resources.cpu} 核 · {memoryLabel(resources.memoryGi)} ·{" "}
                {resources.diskGi}Gi
              </span>
            </div>
            <ResourceConfig
              value={resources}
              onChange={setResources}
              disabled={busy !== null}
            />
            <div className="mt-4 flex justify-end">
              <Button
                disabled={busy !== null || !dirty}
                onClick={() =>
                  run("update", () => boatClient.updateSandbox(id, resources))
                }
              >
                {busy === "update" ? "更新中…" : "应用配置"}
              </Button>
            </div>
          </section>

          <section>
            <p className="mb-2 px-1 text-[13px] font-medium uppercase tracking-wide text-muted">
              生命周期
            </p>
            <div className="panel flex flex-wrap gap-2 p-4">
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => run("stop", () => boatClient.stopSandbox(id))}
              >
                {busy === "stop" ? "停止中…" : "停止"}
              </Button>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() =>
                  run("resume", () => boatClient.resumeSandbox(id))
                }
              >
                {busy === "resume" ? "恢复中…" : "恢复"}
              </Button>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void refresh()}
              >
                刷新
              </Button>
              <Button
                variant="danger"
                disabled={busy !== null}
                onClick={() =>
                  run("delete", async () => {
                    if (!confirm(`确认删除 ${id}？`)) return;
                    await boatClient.deleteSandbox(id);
                    router.replace("/sandboxes");
                  })
                }
              >
                {busy === "delete" ? "删除中…" : "删除"}
              </Button>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
