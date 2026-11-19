import { App, Button, Modal, Spin } from "antd";
import { useEffect, useState } from "react";
import { trpc } from "@/api/trpc";

function mcpConnectJson(token: string) {
  return JSON.stringify(
    {
      mcpServers: {
        sandbox: {
          url: `${window.location.origin}/api/mcp`,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    },
    null,
    2,
  );
}

export function McpConnectModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [json, setJson] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setJson("");
    setLoading(true);
    trpc.auth.token
      .query(undefined, { context: { silent: true } })
      .then((result) => {
        if (!cancelled) setJson(mcpConnectJson(result.token));
      })
      .catch((err) => {
        if (!cancelled) {
          message.error(err instanceof Error ? err.message : "读取令牌失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, message]);

  return (
    <Modal
      title="接入 MCP"
      open={open}
      onCancel={onClose}
      footer={
        <Button
          type="primary"
          disabled={!json}
          onClick={() => {
            void navigator.clipboard.writeText(json).then(
              () => message.success("已复制"),
              () => message.error("复制失败"),
            );
          }}
        >
          复制
        </Button>
      }
      width={640}
      centered
      destroyOnHidden
    >
      <Spin spinning={loading}>
        <pre
          style={{
            margin: 0,
            minHeight: 160,
            padding: 12,
            maxHeight: 420,
            overflow: "auto",
            borderRadius: 8,
            background: "var(--ant-color-fill-quaternary)",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {json}
        </pre>
      </Spin>
    </Modal>
  );
}
