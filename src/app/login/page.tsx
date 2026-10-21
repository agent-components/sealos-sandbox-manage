"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Form, Input } from "antd";
import { Brand } from "@/components/Brand";
import { sandboxClient } from "@/lib/client";
import { PRODUCT_NAME } from "@/lib/product";

type LoginValues = {
  username: string;
  password: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onFinish(values: LoginValues) {
    setLoading(true);
    setError(null);
    try {
      await sandboxClient.login(values.username.trim(), values.password);
      router.replace("/sandboxes");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <aside className="login-brand-panel" aria-label="产品介绍">
        <div className="login-brand-glow" aria-hidden />
        <div className="login-brand-grid" aria-hidden />
        <div className="login-brand-content">
          <Brand large />
          <ul className="login-brand-points">
            <li>按需配置 CPU / 内存 / 磁盘</li>
            <li>一键创建，秒级就绪</li>
            <li>公网直连，开箱即用</li>
          </ul>
        </div>
        <p className="login-brand-foot">{PRODUCT_NAME}</p>
      </aside>

      <main className="login-form-panel">
        <div className="login-form-shell">
          <div className="login-form-heading">
            <h1>登录</h1>
            <p>使用账号进入沙箱控制台</p>
          </div>

          <Form<LoginValues>
            layout="vertical"
            requiredMark={false}
            onFinish={onFinish}
            initialValues={{ username: "", password: "" }}
            className="login-form"
          >
            <Form.Item
              label="用户名"
              name="username"
              rules={[{ required: true, message: "请输入用户名" }]}
            >
              <Input size="large" autoComplete="username" placeholder="请输入用户名" />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password
                size="large"
                autoComplete="current-password"
                placeholder="请输入密码"
              />
            </Form.Item>
            {error ? (
              <Alert
                type="error"
                showIcon
                title={error}
                style={{ marginBottom: 16 }}
              />
            ) : null}
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading}
              className="login-submit"
            >
              登录
            </Button>
          </Form>
        </div>
      </main>
    </div>
  );
}
