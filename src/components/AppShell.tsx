"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Layout, Space, Typography } from "antd";
import { Brand } from "@/components/Brand";
import { boatClient, type BoatUser } from "@/lib/client";

const { Header, Content } = Layout;

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
    <Layout className="min-h-full bg-white">
      <Header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6 leading-none">
        <Space size={24}>
          <Link href="/sandboxes">
            <Brand />
          </Link>
          <Link
            href="/sandboxes"
            className={`rounded px-2 py-1 text-sm ${pathname.startsWith("/sandboxes")
                ? "bg-gray-100 font-medium text-black"
                : "text-gray-600"
              }`}
          >
            沙箱
          </Link>
        </Space>
        <Space>
          <Typography.Text type="secondary">{user?.username}</Typography.Text>
          <Button size="small" onClick={logout}>
            退出
          </Button>
        </Space>
      </Header>
      <Content className="mx-auto w-full max-w-5xl px-6 py-8">{children}</Content>
    </Layout>
  );
}
