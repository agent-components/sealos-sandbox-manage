"use client";

import { useEffect, useState } from "react";
import { App, Typography } from "antd";
import { ProDrawer } from "listpage-components/ProDrawer";
import { sandboxClient } from "@/lib/client";
import { formatTime, sandboxIdOf } from "./types";

const ARG_ORDER = [
  "pattern",
  "path",
  "glob",
  "glob_pattern",
  "target_directory",
  "output_mode",
  "case_insensitive",
  "context",
  "head_limit",
  "multiline",
  "offset",
  "limit",
  "old_string",
  "new_string",
  "replace_all",
  "contents",
  "working_directory",
];

function formatArg(key: string, value: unknown) {
  if (value === undefined || value === null || value === "" || value === false) return "";
  if (typeof value === "string") {
    return value.includes("\n") ? `${key}:\n${value}` : `${key}: ${value}`;
  }
  if (typeof value === "number" || typeof value === "boolean") return `${key}: ${String(value)}`;
  return `${key}: ${JSON.stringify(value)}`;
}

/** exec 显示命令；grep / read 等显示工具参数（沙箱 id 已在标题）。 */
function argumentView(args: Record<string, unknown> | undefined) {
  const command = args?.command;
  if (typeof command === "string" && command) {
    return { kind: "command" as const, text: command };
  }
  if (!args) return { kind: "text" as const, text: "" };
  const ranked = new Map(ARG_ORDER.map((key, index) => [key, index]));
  const lines = Object.entries(args)
    .filter(([key]) => key !== "id")
    .sort(([a], [b]) => (ranked.get(a) ?? 100) - (ranked.get(b) ?? 100) || a.localeCompare(b))
    .map(([key, value]) => formatArg(key, value))
    .filter(Boolean);
  return { kind: "text" as const, text: lines.join("\n") };
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

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** grep 的结果是匹配文本；read 的结果在 data 里。 */
function fileResultOf(value: unknown, args: Record<string, unknown>) {
  if (typeof value === "string") return { failed: false, text: value };
  const record = asRecord(value);
  if (!record) return null;
  const nested = asRecord(record.structuredContent);
  const body = nested ?? record;
  const errorText = typeof body.error === "string" ? body.error : "";
  if (errorText) return { failed: true, text: errorText };
  if (typeof body.data === "string") {
    if (body.encoding === "base64") {
      const media = typeof body.mediaType === "string" ? body.mediaType : "二进制";
      const bytes = typeof body.bytes === "number" ? `，${body.bytes} 字节` : "";
      return { failed: false, text: `${media}${bytes}` };
    }
    const wholeFile =
      args.offset === undefined &&
      args.limit === undefined &&
      typeof body.totalLines === "number" &&
      body.totalLines > 0;
    const note = wholeFile ? `\n\n(共 ${body.totalLines} 行)` : "";
    return { failed: false, text: `${body.data}${note}` };
  }
  if (typeof body.text === "string" && body.text) return { failed: false, text: body.text };
  return { failed: false, text: JSON.stringify(body, null, 2) };
}

function resultView(detail: McpLogDetail) {
  if (detail.resultLoadError) {
    return { failed: true, text: detail.resultLoadError };
  }
  const isExec =
    detail.log.tool === "exec" || typeof detail.log.arguments.command === "string";
  if (isExec) {
    const command = commandResultOf(detail.result);
    if (command) {
      if (command.ok) return { failed: false, text: command.stdout };
      const errorText = command.stderr.trim() ? command.stderr : command.stdout;
      if (errorText.trim()) return { failed: true, text: errorText };
      const code = command.exitCode == null ? "" : `，退出码 ${command.exitCode}`;
      return { failed: true, text: `命令失败${code}` };
    }
  }
  const file = fileResultOf(detail.result, detail.log.arguments);
  if (file) return file;
  const errorText = errorTextOf(detail.result);
  if (errorText) return { failed: true, text: errorText };
  if (detail.log.resultError) return { failed: true, text: detail.log.resultError };
  if (!detail.log.ok) return { failed: true, text: "调用失败" };
  return { failed: false, text: "" };
}

function LogBody({ detail }: { detail: McpLogDetail }) {
  const args = argumentView(detail.log.arguments);
  const result = resultView(detail);
  const emptyArgs = detail.log.tool === "exec" ? "无命令" : "无参数";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "16px 20px 24px" }}>
      <div>
        <Typography.Text type="secondary">参数</Typography.Text>
        {args.kind === "command" ? (
          <pre className="sandbox-shell-block">
            <span className="sandbox-shell-prompt">$ </span>
            {args.text}
          </pre>
        ) : args.text ? (
          <pre className="sandbox-shell-block">{args.text}</pre>
        ) : (
          <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0" }}>
            {emptyArgs}
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
