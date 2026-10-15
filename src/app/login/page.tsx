"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
      <div className="animate-rise">
        <Brand large />
      </div>
      <form onSubmit={onSubmit} className="animate-rise mt-10 space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-gray-600">用户名</span>
          <Input
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用户名"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-gray-600">密码</span>
          <Input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button
          type="submit"
          className="w-full"
          disabled={loading || !username.trim() || !password}
        >
          {loading ? "登录中…" : "登录"}
        </Button>
      </form>
    </main>
  );
}
