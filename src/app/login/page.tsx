"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Form, Input, Typography } from "antd";
import { Brand } from "@/components/Brand";
import { boatClient } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await boatClient.login(username.trim(), password);
      router.replace("/sandboxes");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-6 py-16">
      <Brand large />
      <Card className="mt-8" styles={{ body: { padding: 24 } }}>
        <form onSubmit={onSubmit}>
          <Form layout="vertical">
            <Form.Item label="用户名" required>
              <Input
                size="large"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="用户名"
              />
            </Form.Item>
            <Form.Item label="密码" required>
              <Input.Password
                size="large"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
              />
            </Form.Item>
            {error ? (
              <Typography.Text type="danger" className="mb-3 block">
                {error}
              </Typography.Text>
            ) : null}
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading}
              disabled={!username.trim() || !password}
            >
              登录
            </Button>
          </Form>
        </form>
      </Card>
    </main>
  );
}
