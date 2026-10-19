"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Flex, Form, Input } from "antd";
import { Brand } from "@/components/Brand";
import { sandboxClient } from "@/lib/client";

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
    <Flex
      vertical
      align="center"
      justify="center"
      style={{ flex: 1, minHeight: "100%", padding: 24 }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <Brand large />
        <Card style={{ marginTop: 24 }}>
          <Form<LoginValues>
            layout="vertical"
            requiredMark={false}
            onFinish={onFinish}
            initialValues={{ username: "", password: "" }}
          >
            <Form.Item
              label="用户名"
              name="username"
              rules={[{ required: true, message: "请输入用户名" }]}
            >
              <Input size="large" autoComplete="username" placeholder="用户名" />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password
                size="large"
                autoComplete="current-password"
                placeholder="密码"
              />
            </Form.Item>
            {error ? (
              <Alert
                type="error"
                showIcon
                message={error}
                style={{ marginBottom: 16 }}
              />
            ) : null}
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading}
            >
              登录
            </Button>
          </Form>
        </Card>
      </div>
    </Flex>
  );
}
