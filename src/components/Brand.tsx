import { Typography } from "antd";

export function Brand({ large = false }: { large?: boolean }) {
  if (large) {
    return (
      <div>
        <Typography.Title level={2} style={{ marginBottom: 8 }}>
          boat
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          云端沙箱控制台。配置算力，一键创建，公网直连。
        </Typography.Paragraph>
      </div>
    );
  }

  return (
    <Typography.Text strong style={{ fontSize: 16 }}>
      boat
    </Typography.Text>
  );
}
