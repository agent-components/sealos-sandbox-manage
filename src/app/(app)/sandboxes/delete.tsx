"use client";

import { useState } from "react";
import { App, Input, Modal, Typography } from "antd";
import { boatClient } from "@/lib/client";
import type { Sandbox } from "@/lib/sandbox/schema";

export function DeleteSandboxModal({
  sandbox,
  open,
  onClose,
  onSaved,
}: {
  sandbox: Sandbox | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!sandbox) return;
    if (confirm.trim() !== sandbox.id) {
      message.error("输入的 ID 与沙箱 ID 不一致");
      return;
    }
    setDeleting(true);
    try {
      await boatClient.deleteSandbox(sandbox.id);
      message.success("已删除");
      onClose();
      onSaved();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      title="删除沙箱"
      open={open}
      onCancel={() => {
        if (!deleting) onClose();
      }}
      centered
      destroyOnHidden
      okText="确认删除"
      okButtonProps={{
        danger: true,
        disabled: !sandbox || confirm.trim() !== sandbox.id,
        loading: deleting,
      }}
      cancelButtonProps={{ disabled: deleting }}
      onOk={() => void confirmDelete()}
    >
      <Typography.Paragraph type="secondary">
        此操作不可恢复。请输入沙箱 ID{" "}
        <Typography.Text code>{sandbox?.id}</Typography.Text> 以确认删除。
      </Typography.Paragraph>
      <Input
        autoFocus
        value={confirm}
        disabled={deleting}
        placeholder={sandbox?.id}
        onChange={(e) => setConfirm(e.target.value)}
        onPressEnter={() => void confirmDelete()}
      />
    </Modal>
  );
}
