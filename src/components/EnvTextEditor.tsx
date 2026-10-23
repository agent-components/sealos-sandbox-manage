"use client";

import { Input, Typography } from "antd";

export function EnvTextEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Input.TextArea
        value={value}
        disabled={disabled}
        autoSize={{ minRows: 8, maxRows: 16 }}
        placeholder={"DATABASE_URL=postgres://localhost/app\nexport TOKEN=secret"}
        style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
        onChange={(event) => onChange(event.target.value)}
      />
      <Typography.Text
        type="secondary"
        style={{ display: "block", marginTop: 8, fontSize: 12 }}
      >
        每行一个变量。保存时自动识别 KEY=value、export 和 JSON
      </Typography.Text>
    </div>
  );
}
