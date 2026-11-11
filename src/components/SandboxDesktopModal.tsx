"use client";

import { useEffect, useState } from "react";
import { CloseOutlined } from "@ant-design/icons";
import { Alert, Flex, Modal, Spin } from "antd";
import { sandboxClient } from "@/lib/client";
import {
  SANDBOX_DESKTOP_HEIGHT,
  SANDBOX_DESKTOP_WIDTH,
  sandboxDesktopUrl,
} from "@/lib/sandbox/desktop";

type Props = {
  sandboxId: string;
  open: boolean;
  onClose: () => void;
};

const VIEW_GUTTER = 48;
const HEADER_HEIGHT = 48;

/** 在视口里放下一块 1920×1080 的画面，并给出等比缩放。 */
function fitDesktop(viewportWidth: number, viewportHeight: number) {
  const maxWidth = Math.max(320, viewportWidth - VIEW_GUTTER);
  const maxHeight = Math.max(
    180,
    viewportHeight - VIEW_GUTTER - HEADER_HEIGHT,
  );
  const width = Math.min(
    maxWidth,
    Math.floor((maxHeight * SANDBOX_DESKTOP_WIDTH) / SANDBOX_DESKTOP_HEIGHT),
  );
  const height = Math.round((width * SANDBOX_DESKTOP_HEIGHT) / SANDBOX_DESKTOP_WIDTH);
  return {
    width,
    height,
    scale: width / SANDBOX_DESKTOP_WIDTH,
  };
}

export function SandboxDesktopModal({ sandboxId, open, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fit, setFit] = useState(() => fitDesktop(1440, 900));

  useEffect(() => {
    if (!open) return;
    const update = () => setFit(fitDesktop(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  useEffect(() => {
    if (!open || !sandboxId) {
      setUrl(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setUrl(null);
    setError(null);
    setLoading(true);
    void sandboxClient
      .getSandbox(sandboxId)
      .then(({ sandbox }) => {
        if (cancelled) return;
        const result = sandboxDesktopUrl(sandbox);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setUrl(result.url);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "打开桌面失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sandboxId]);

  return (
    <Modal
      title={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 600, lineHeight: "28px" }}>
            桌面 · {sandboxId}
          </span>
          <button
            type="button"
            className="pro-drawer-icon-btn"
            aria-label="关闭"
            onClick={onClose}
          >
            <CloseOutlined />
          </button>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={url ? fit.width : 520}
      centered
      destroyOnHidden
      styles={{
        container: {
          padding: 0,
          overflow: "hidden",
        },
        header: {
          flex: "none",
          margin: 0,
          padding: "8px 16px",
          borderBottom: "1px solid var(--ant-color-border)",
          background: "var(--ant-color-bg-container)",
        },
        body: {
          padding: 0,
          overflow: "hidden",
        },
      }}
    >
      {loading ? (
        <Flex align="center" justify="center" style={{ minHeight: 160 }}>
          <Spin />
        </Flex>
      ) : error ? (
        <div style={{ padding: 24 }}>
          <Alert type="error" showIcon title={error} />
        </div>
      ) : url ? (
        <div
          style={{
            width: fit.width,
            height: fit.height,
            overflow: "hidden",
            background: "#000",
          }}
        >
          <div
            style={{
              width: SANDBOX_DESKTOP_WIDTH,
              height: SANDBOX_DESKTOP_HEIGHT,
              transform: `scale(${fit.scale})`,
              transformOrigin: "top left",
            }}
          >
            <iframe
              src={url}
              title={`${sandboxId} 桌面`}
              scrolling="no"
              style={{
                display: "block",
                width: SANDBOX_DESKTOP_WIDTH,
                height: SANDBOX_DESKTOP_HEIGHT,
                border: 0,
                background: "#000",
              }}
              allow="clipboard-read; clipboard-write; fullscreen"
            />
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
