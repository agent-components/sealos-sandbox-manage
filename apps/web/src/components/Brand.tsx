import { PRODUCT_NAME } from "@/lib/product";

export function Brand({ large = false }: { large?: boolean }) {
  if (large) {
    return (
      <div className="login-brand-mark">
        <img src="/logo.png" alt="" className="sandbox-logo sandbox-logo-lg" />
        <h2 className="login-brand-title">{PRODUCT_NAME}</h2>
        <p className="login-brand-tagline">
          云端沙箱控制台。配置算力，一键创建，公网直连。
        </p>
      </div>
    );
  }

  return (
    <span className="login-brand-inline">{PRODUCT_NAME}</span>
  );
}
