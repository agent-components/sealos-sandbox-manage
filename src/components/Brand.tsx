import { Typography } from "antd";
import { PRODUCT_NAME } from "@/lib/product";

export function Brand({ large = false }: { large?: boolean }) {
  if (large) {
    return (
      <div>
        <img src="/logo.png" alt="" className="boat-logo boat-logo-lg" />
        <Typography.Title level={2} style={{ marginTop: 12, marginBottom: 8 }}>
          {PRODUCT_NAME}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          云端沙箱控制台。配置算力，一键创建，公网直连。
        </Typography.Paragraph>
      </div>
    );
  }

  return (
    <Typography.Text strong style={{ fontSize: 16 }}>
      {PRODUCT_NAME}
    </Typography.Text>
  );
}
