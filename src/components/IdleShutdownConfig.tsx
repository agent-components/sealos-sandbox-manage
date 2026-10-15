"use client";

import { Flex, Form, InputNumber, Switch, Typography } from "antd";

export type IdleShutdownValue = {
  autoShutdown: boolean;
  idleMinutes: number;
};

type Props = {
  value: IdleShutdownValue;
  onChange: (value: IdleShutdownValue) => void;
  disabled?: boolean;
  /** form：模板表单的 Form.Item；stack：沙箱详情 / 创建弹窗 */
  layout?: "form" | "stack";
};

function MinutesField({
  value,
  onChange,
  disabled,
}: {
  value: IdleShutdownValue;
  onChange: (value: IdleShutdownValue) => void;
  disabled?: boolean;
}) {
  return (
    <Flex align="center" gap={8} wrap="wrap">
      <Typography.Text type="secondary">空闲超过</Typography.Text>
      <InputNumber
        min={5}
        max={10080}
        value={value.idleMinutes}
        disabled={disabled}
        style={{ width: 88 }}
        onChange={(next) =>
          onChange({
            ...value,
            idleMinutes: typeof next === "number" && next >= 5 ? next : 5,
          })
        }
      />
      <Typography.Text type="secondary">分钟后关机</Typography.Text>
    </Flex>
  );
}

export function IdleShutdownConfig({
  value,
  onChange,
  disabled,
  layout = "form",
}: Props) {
  const switchControl = (
    <Switch
      checked={value.autoShutdown}
      disabled={disabled}
      onChange={(checked) => onChange({ ...value, autoShutdown: checked })}
    />
  );

  if (layout === "stack") {
    return (
      <div
        style={{
          pointerEvents: disabled ? "none" : undefined,
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <Flex
          align="baseline"
          justify="space-between"
          style={{ marginBottom: 10 }}
        >
          <Typography.Text style={{ color: "rgba(0,0,0,0.88)" }}>
            自动关机
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {value.autoShutdown ? `${value.idleMinutes} 分钟` : "关闭"}
          </Typography.Text>
        </Flex>
        <Flex align="center" gap={16} wrap="wrap">
          {switchControl}
          {value.autoShutdown ? (
            <MinutesField
              value={value}
              onChange={onChange}
              disabled={disabled}
            />
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              MCP 无新请求超过等待时长后关机
            </Typography.Text>
          )}
        </Flex>
      </div>
    );
  }

  return (
    <>
      <Form.Item
        label="自动关机"
        extra="仅统计 MCP 请求；关闭后不会因空闲关机"
      >
        <Flex align="center" gap={16} wrap="wrap">
          {switchControl}
          {value.autoShutdown ? (
            <MinutesField
              value={value}
              onChange={onChange}
              disabled={disabled}
            />
          ) : null}
        </Flex>
      </Form.Item>
    </>
  );
}
