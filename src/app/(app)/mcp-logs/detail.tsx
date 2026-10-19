"use client";

import { useEffect, useState } from "react";
import { App, Typography } from "antd";
import { ProDrawer } from "listpage-components/ProDrawer";
import { sandboxClient } from "@/lib/client";
import { formatTime, sandboxIdOf } from "./types";

function commandOf(args: Record<string, unknown> | undefined) {
  const command = args?.command;
  return typeof command === "string" ? command : "";
}

function commandResultOf(value: unknown) {
  let data = value;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const nested = record.structuredContent;
  const body =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : record;
  if (
    !("stdout" in body) &&
    !("stderr" in body) &&
    !("ok" in body) &&
    !("exitCode" in body)
  ) {
    return null;
  }
  const exitCode = typeof body.exitCode === "number" ? body.exitCode : undefined;
  const ok = typeof body.ok === "boolean" ? body.ok : exitCode === 0;
  return {
    ok,
    exitCode,
    stdout: typeof body.stdout === "string" ? body.stdout : "",
    stderr: typeof body.stderr === "string" ? body.stderr : "",
  };
}

function errorTextOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const error = (value as Record<string, unknown>).error;
  return typeof error === "string" ? error : "";
}

type McpLogDetail = NonNullable<Awaited<ReturnType<typeof sandboxClient.getMcpLog>>>;

function resultView(detail: McpLogDetail) {
  if (detail.resultLoadError) {
    return { failed: true, text: detail.resultLoadError };
  }
  const command = commandResultOf(detail.result);
  if (command) {
    if (command.ok) return { failed: false, text: command.stdout };
    const errorText = command.stderr.trim() ? command.stderr : command.stdout;
    if (errorText.trim()) return { failed: true, text: errorText };
    const code = command.exitCode == null ? "" : `，退出码 ${command.exitCode}`;
    return { failed: true, text: `命令失败${code}` };
  }
  const errorText = errorTextOf(detail.result);
  if (errorText) return { failed: true, text: errorText };
  if (detail.log.resultError) return { failed: true, text: detail.log.resultError };
  if (!detail.log.ok) return { failed: true, text: "调用失败" };
  return { failed: false, text: "" };
}

function LogBody({ detail }: { detail: McpLogDetail }) {
  const command = commandOf(detail.log.arguments);
  const result = resultView(detail);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "16px 20px 24px" }}>
      <div>
        <Typography.Text type="secondary">参数</Typography.Text>
        {command ? (
          <pre className="sandbox-shell-block">
            <span className="sandbox-shell-prompt">$ </span>
            {command}
          </pre>
        ) : (
          <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0" }}>
            无命令
          </Typography.Paragraph>
        )}
      </div>
      <div>
        <Typography.Text type="secondary">结果</Typography.Text>
        {result.text ? (
          <pre className={result.failed ? "sandbox-shell-block is-error" : "sandbox-shell-block"}>
            {result.text}
          </pre>
        ) : (
          <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0" }}>
            {result.failed ? "调用失败" : "（无输出）"}
          </Typography.Paragraph>
        )}
      </div>
    </div>
  );
}

export function McpLogDetailDrawer({
  logId,
  onClose,
}: {
  logId: string | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<McpLogDetail | null>(null);

  useEffect(() => {
    if (!logId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    void sandboxClient
      .getMcpLog(logId)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((err) => {
        if (!cancelled) {
          message.error(err instanceof Error ? err.message : "加载详情失败");
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [logId, message, onClose]);

  return (
    <ProDrawer
      open={!!logId}
      size="medium"
      title={
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, lineHeight: 1.4 }}>
            {sandboxIdOf(detail?.log.arguments) || "调用详情"}
          </div>
          {detail ? (
            <div
              style={{
                marginTop: 2,
                fontSize: 12,
                fontWeight: 400,
                lineHeight: 1.4,
                color: "var(--ant-color-text-secondary)",
              }}
            >
              {formatTime(
                detail.log.startedAt || detail.log.completedAt || detail.log.createdAt,
              )}
            </div>
          ) : null}
        </div>
      }
      onClose={onClose}
    >
      {detailLoading || !detail ? (
        <Typography.Text type="secondary">加载中…</Typography.Text>
      ) : (
        <LogBody detail={detail} />
      )}
    </ProDrawer>
  );
}
