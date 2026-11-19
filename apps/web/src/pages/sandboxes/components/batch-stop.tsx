import { useState } from "react";
import { App, Button, Typography } from "antd";
import { trpc } from '@/api/trpc';
import { canStop } from '../config/columns';
import type { Sandbox } from "@/modules/sandbox/schema";

export function BatchStopButton({
  rows,
  onDone,
}: {
  rows: Sandbox[];
  onDone: () => void;
}) {
  const { message, modal } = App.useApp();
  const [busy, setBusy] = useState(false);

  function stopSelected() {
    const targets = rows.filter((row) => canStop(row.state));
    if (targets.length === 0) {
      message.info("所选沙箱都已关机或无法关机");
      return;
    }
    const skipped = rows.length - targets.length;
    modal.confirm({
      title: `关机 ${targets.length} 个沙箱？`,
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>
            {skipped > 0
              ? `另有 ${skipped} 个已关机或无法关机，会跳过。`
              : "确认后会立即关机。"}
          </p>
          <div style={{ maxHeight: 240, overflow: "auto" }}>
            {targets.map((row) => (
              <div key={row.id}>
                <Typography.Text>{row.id}</Typography.Text>
              </div>
            ))}
          </div>
        </div>
      ),
      okText: "关机",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        setBusy(true);
        try {
          const settled = await Promise.allSettled(
            targets.map((row) => trpc.sandboxes.stop.mutate({ id: row.id })),
          );
          const failed = settled.filter(
            (item) => item.status === "rejected",
          ).length;
          if (failed > 0) {
            message.error(
              `已关机 ${targets.length - failed} 个，${failed} 个失败`,
            );
          } else {
            message.success(`已关机 ${targets.length} 个沙箱`);
          }
          onDone();
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <Button size="small" danger loading={busy} onClick={stopSelected}>
      关机
    </Button>
  );
}
