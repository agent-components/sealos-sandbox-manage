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
      <main className="mx-auto flex min-h-full max-w-5xl items-center px-6 py-24 text-sm text-gray-600">
        正在进入控制台…
      </main>
    );
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-gray-300">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link href="/sandboxes">
              <Brand />
            </Link>
            <nav className="hidden items-center gap-1 sm:flex">
              <Link
                href="/sandboxes"
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  pathname.startsWith("/sandboxes")
                    ? "bg-gray-100 font-medium text-foreground"
                    : "text-gray-600 hover:text-foreground"
                }`}
              >
                沙箱
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user?.username}</span>
            <Button variant="secondary" size="sm" onClick={logout}>
              退出
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="animate-rise">{children}</div>
      </div>
    </div>
  );
}
