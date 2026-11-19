import { useEffect, useState } from "react";
import { App, Form, InputNumber, Modal, Switch, Typography } from "antd";
import { trpc } from '@/api/trpc';
export function SystemSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    trpc.settings
      .get.query()
      .then((res) => {
        if (cancelled) return;
        const value = res.settings.logRetentionDays;
        setEnabled(value != null);
        setDays(value ?? 30);
      })
      .catch((err) => {
        if (!cancelled) {
          message.error(err instanceof Error ? err.message : "加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, message]);

  async function save() {
    if (enabled && (!Number.isInteger(days) || days < 1)) {
      message.error("保留天数至少为 1");
      return;
    }
    setSaving(true);
    try {
      await trpc.settings.update.mutate({
        logRetentionDays: enabled ? days : null,
      });
      message.success("已保存");
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="系统设置"
      open={open}
      onCancel={() => {
        if (!saving) onClose();
      }}
      onOk={() => void save()}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      cancelButtonProps={{ disabled: saving }}
      okButtonProps={{ disabled: loading }}
      width={480}
      centered
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        调用日志保留策略对所有用户生效。开启后每天自动删除超出保留天数的记录，以及对象存储中的调用结果。
      </Typography.Paragraph>
      <Form layout="vertical" disabled={loading || saving}>
        <Form.Item label="自动清理调用日志">
          <Switch checked={enabled} onChange={setEnabled} />
        </Form.Item>
        <Form.Item
          label="保留天数"
          extra="早于该天数的日志会在每天一次的定时任务中删除。"
        >
          <InputNumber
            min={1}
            max={3650}
            precision={0}
            value={days}
            disabled={!enabled || loading || saving}
            style={{ width: 160 }}
            addonAfter="天"
            onChange={(value) => {
              if (typeof value === "number") setDays(value);
            }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
