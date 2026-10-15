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
    <main className="relative mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-6 py-20">
      <div className="animate-rise">
        <Brand large />
      </div>
      <form
        onSubmit={onSubmit}
        className="animate-rise-late mt-14 space-y-5 rounded-2xl border border-line bg-surface/90 p-6 shadow-sm backdrop-blur-sm sm:p-8"
      >
        <label className="block space-y-2">
          <span className="text-sm text-muted">用户名</span>
          <Input
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="请输入用户名"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm text-muted">密码</span>
          <Input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button
          type="submit"
          className="w-full"
          disabled={loading || !username.trim() || !password}
        >
          {loading ? "登录中…" : "进入控制台"}
        </Button>
      </form>
    </main>
  );
}
