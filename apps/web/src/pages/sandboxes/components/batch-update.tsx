import { useState } from "react";
import { App, Button, Typography } from "antd";
import { TemplateDiffList } from "./TemplateDiffList";
import { trpc } from '@/api/trpc';
import type { Sandbox } from "@/modules/sandbox/schema";
import {
  previewTemplateApply,
  type TemplateDiffItem,
} from "@/modules/sandbox/template-apply-diff";

type DiffRow = {
  sandbox: Sandbox;
  diffs: TemplateDiffItem[];
};

export function BatchUpdateButton({
  rows,
  onDone,
}: {
  rows: Sandbox[];
  onDone: () => void;
}) {
  const { message, modal } = App.useApp();
  const [busy, setBusy] = useState(false);

  async function updateSelected() {
    if (rows.length === 0) return;
    setBusy(true);
    try {
      const checked = await Promise.all(
        rows.map(async (row) => {
          if (!row.templateId) return { sandbox: row, diffs: null };
          const [{ sandbox }, { template }] = await Promise.all([
            trpc.sandboxes.get.query({ id: row.id }),
            trpc.templates.get.query({ id: row.templateId }),
          ]);
          return {
            sandbox,
            diffs: previewTemplateApply(sandbox, template).diffs,
          };
        }),
      );
      const missing = checked.filter((item) => item.diffs === null);
      const pending = checked.filter(
        (item): item is DiffRow =>
          item.diffs !== null && item.diffs.length > 0,
      );
      if (pending.length === 0) {
        message.info(
          missing.length > 0
            ? "所选沙箱没有可更新的差异，其中有未关联模板的沙箱"
            : "所选沙箱已经是最新模板状态",
        );
        return;
      }
      const skipped = checked.length - pending.length;
      modal.confirm({
        title: `更新 ${pending.length} 个沙箱？`,
        width: 640,
        content: (
          <div>
            <p style={{ marginBottom: 8 }}>
              {skipped > 0
                ? `另有 ${skipped} 个已是最新或未关联模板，会跳过。`
                : "确认后会立即同步到 Sealos。"}
              资源配置（CPU / 内存 / 磁盘 / 实例数）保持不变。
            </p>
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              {pending.map((item) => (
                <div key={item.sandbox.id} style={{ marginBottom: 16 }}>
                  <Typography.Text strong>{item.sandbox.id}</Typography.Text>
                  <TemplateDiffList items={item.diffs} />
                </div>
              ))}
            </div>
          </div>
        ),
        okText: "更新",
        cancelText: "取消",
        onOk: async () => {
          const settled = await Promise.allSettled(
            pending.map((item) =>
              trpc.sandboxes.syncTemplate.mutate({ id: item.sandbox.id }),
            ),
          );
          const failed = settled.filter(
            (item) => item.status === "rejected",
          ).length;
          if (failed > 0) {
            message.error(
              `已更新 ${pending.length - failed} 个，${failed} 个失败`,
            );
          } else {
            message.success(`已更新 ${pending.length} 个沙箱`);
          }
          onDone();
        },
      });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "批量更新失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="primary"
      size="small"
      loading={busy}
      onClick={() => void updateSelected()}
    >
      更新
    </Button>
  );
}
