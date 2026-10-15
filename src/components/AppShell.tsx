"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { boatClient, type BoatUser } from "@/lib/client";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<BoatUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    boatClient
      .me()
      .then((res) => {
        if (cancelled) return;
        if (!res.authenticated || !res.user) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        setUser(res.user);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  async function logout() {
    await boatClient.logout();
    router.replace("/login");
  }

  if (!ready) {
    return (
      <main className="mx-auto flex min-h-full max-w-5xl items-center px-6 py-20 text-muted">
        <span className="animate-pulse-dot">正在进入控制台…</span>
      </main>
    );
  }

  const initial = (user?.username?.[0] ?? "?").toUpperCase();

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 py-8">
      <header className="mb-10 flex items-center justify-between gap-4 border-b border-line pb-5">
        <Link href="/sandboxes" className="transition hover:opacity-90">
          <Brand />
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 shadow-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
              {initial}
            </span>
            <span className="text-sm text-muted">{user?.username}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={logout}>
            退出
          </Button>
        </div>
      </header>
      <div className="animate-rise">{children}</div>
    </div>
  );
}
