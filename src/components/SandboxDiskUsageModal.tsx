"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Progress, Table, Typography } from "antd";
import { sandboxClient, type EphemeralDiskReport } from "@/lib/client";

const POLL_MS = 8_000;

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

function formatDelta(delta: number) {
  if (delta === 0) return "持平";
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${formatBytes(Math.abs(delta))}`;
}

function deltaColor(delta: number) {
  if (delta > 0) return "#cf1322";
  if (delta < 0) return "#389e0d";
  return "rgba(0, 0, 0, 0.45)";
}

type DirectoryRow = {
  path: string;
  bytes: number;
  delta: number | null;
};

function directoryRows(
  report: EphemeralDiskReport,
  previous: EphemeralDiskReport | null,
): DirectoryRow[] {
  const before = new Map(
    previous?.directories.map((item) => [item.path, item.bytes]) ?? [],
  );
  const seen = new Set<string>();
  const rows: DirectoryRow[] = report.directories.map((item) => {
    seen.add(item.path);
    const last = before.get(item.path);
    return {
      path: item.path,
      bytes: item.bytes,
      // 只减上一次扫到的该目录大小。上次没有这个目录，就是从 0 增加。
      delta: previous ? item.bytes - (last ?? 0) : null,
    };
  });
  if (previous) {
    for (const item of previous.directories) {
      if (seen.has(item.path) || item.bytes === 0) continue;
      rows.push({ path: item.path, bytes: 0, delta: -item.bytes });
    }
  }
  rows.sort(
    (a, b) => b.bytes - a.bytes || Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0),
  );
  return rows;
}

export function SandboxDiskUsageModal({
  sandboxId,
  open,
  onClose,
}: {
  sandboxId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [report, setReport] = useState<EphemeralDiskReport | null>(null);
  const [previous, setPrevious] = useState<EphemeralDiskReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reportRef = useRef<EphemeralDiskReport | null>(null);

  useEffect(() => {
    if (!open || !sandboxId) return;
    let cancelled = false;
    let timer = 0;

    async function tick() {
      setLoading(true);
      try {
        const next = await sandboxClient.getEphemeralDisk(sandboxId);
        if (cancelled) return;
        setPrevious(reportRef.current);
        reportRef.current = next;
        setReport(next);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "检查失败");
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = window.setTimeout(() => void tick(), POLL_MS);
        }
      }
    }

    reportRef.current = null;
    setReport(null);
    setPrevious(null);
    setError(null);
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, sandboxId]);

  const limit = report?.limitBytes ?? 100 * 1024 * 1024;
  const used = report?.usedBytes ?? 0;
  const over = Boolean(report && used > limit);
  const percent = report ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const usedDelta = previous ? used - previous.usedBytes : null;
  const rows = report ? directoryRows(report, previous) : [];

  return (
    <Modal
      title={`临时磁盘 · ${sandboxId}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      centered
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        只看镜像之上的可写层。Sealos 不允许这层超过 100 MB，超出后容器会被清掉。打开后每
        8 秒检查一次，关闭即停止。
      </Typography.Paragraph>
      {error ? (
        <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />
      ) : null}
      <div style={{ marginBottom: 8 }}>
        <Typography.Text strong>
          {report
            ? `${formatBytes(used)} / ${formatBytes(limit)}`
            : error
              ? "检查失败"
              : "检查中…"}
        </Typography.Text>
        {usedDelta !== null ? (
          <span style={{ marginLeft: 8, color: deltaColor(usedDelta) }}>
            {formatDelta(usedDelta)}
          </span>
        ) : null}
        {report ? (
          <Typography.Text type="secondary" style={{ marginLeft: 12 }}>
            {over ? "已超出上限" : "未超出"}
            {report.checkedAt ? ` · ${formatTime(report.checkedAt)}` : ""}
            {loading ? " · 正在刷新" : ""}
          </Typography.Text>
        ) : null}
      </div>
      <Progress
        percent={report ? percent : 0}
        status={over ? "exception" : "active"}
        showInfo={false}
      />
      {report && report.usageSource === "kubelet" ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          可写层 {formatBytes(report.writableBytes ?? 0)}
          {report.logBytes ? `，容器日志 ${formatBytes(report.logBytes)}` : ""}
          。目录是容器启动后写入或改过的文件，不含镜像原有内容和挂载盘。
        </Typography.Paragraph>
      ) : report ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          节点没有返回可写层统计，上面的数字和目录都来自容器内文件扫描。
        </Typography.Paragraph>
      ) : null}
      {report?.detail ? (
        <Alert type="warning" showIcon title={report.detail} style={{ marginTop: 12 }} />
      ) : null}
      <Table
        style={{ marginTop: 16 }}
        size="small"
        rowKey="path"
        pagination={false}
        scroll={{ y: 360 }}
        loading={loading && !report}
        dataSource={rows}
        locale={{ emptyText: report ? "没有发现镜像之上的新增文件" : "检查中…" }}
        columns={[
          { title: "目录", dataIndex: "path", ellipsis: true },
          {
            title: "大小",
            dataIndex: "bytes",
            width: 120,
            align: "right",
            render: (bytes: number) => formatBytes(bytes),
          },
          {
            title: "较上次",
            dataIndex: "delta",
            width: 110,
            align: "right",
            render: (delta: number | null) =>
              delta === null ? (
                "—"
              ) : (
                <span style={{ color: deltaColor(delta) }}>{formatDelta(delta)}</span>
              ),
          },
          {
            title: "占上限",
            dataIndex: "bytes",
            width: 100,
            align: "right",
            render: (bytes: number) =>
              `${Math.round((bytes / limit) * 1000) / 10}%`,
          },
        ]}
      />
    </Modal>
  );
}
