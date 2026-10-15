"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Flex, Modal, Select, Space, Typography } from "antd";
import { boatClient } from "@/lib/client";

type Props = {
  sandboxId: string;
  open: boolean;
  onClose: () => void;
};

export function SandboxLogsModal({ sandboxId, open, onClose }: Props) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [pods, setPods] = useState<
    { name: string; phase: string; container: string; ready: boolean }[]
  >([]);
  const [pod, setPod] = useState<string | null>(null);
  const [logs, setLogs] = useState("");
  const [hint, setHint] = useState<string | undefined>();

  const load = useCallback(
    async (podName?: string | null) => {
      if (!sandboxId) return;
      setLoading(true);
      try {
        const res = await boatClient.getSandboxLogs(sandboxId, {
          pod: podName || undefined,
          tailLines: 800,
        });
        setPods(res.pods);
        setPod(res.pod);
        setLogs(res.logs);
        setHint(res.message);
      } catch (err) {
        message.error(err instanceof Error ? err.message : "加载日志失败");
      } finally {
        setLoading(false);
      }
    },
    [sandboxId, message],
  );

  useEffect(() => {
    if (!open) return;
    setLogs("");
    setHint(undefined);
    setPod(null);
    void load();
  }, [open, sandboxId, load]);

  return (
    <Modal
      title={`日志 · ${sandboxId}`}
      open={open}
      onCancel={onClose}
      centered
      destroyOnHidden
      width={860}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          <Button type="primary" loading={loading} onClick={() => void load(pod)}>
            刷新
          </Button>
        </Space>
      }
      styles={{ body: { paddingTop: 12 } }}
    >
      <Flex align="center" gap={12} style={{ marginBottom: 12 }} wrap>
        <Typography.Text type="secondary">Pod</Typography.Text>
        <Select
          style={{ minWidth: 260 }}
          placeholder={pods.length ? "选择 Pod" : "暂无 Pod"}
          value={pod ?? undefined}
          disabled={!pods.length || loading}
          options={pods.map((p) => ({
            value: p.name,
            label: `${p.name}（${p.phase}）`,
          }))}
          onChange={(value) => {
            setPod(value);
            void load(value);
          }}
        />
      </Flex>
      {hint ? (
        <Typography.Paragraph type="warning" style={{ marginBottom: 8 }}>
          {hint}
        </Typography.Paragraph>
      ) : null}
      <pre
        style={{
          margin: 0,
          maxHeight: "55vh",
          overflow: "auto",
          padding: 12,
          borderRadius: 8,
          border: "1px solid #f0f0f0",
          background: "#0b1020",
          color: "#d7e0f2",
          fontSize: 12,
          lineHeight: 1.55,
          fontFamily: "var(--font-mono)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {loading && !logs ? "加载中…" : logs || "（无日志输出）"}
      </pre>
    </Modal>
  );
}
