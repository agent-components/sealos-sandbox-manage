"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Flex, Menu, Typography } from "antd";
import { Brand } from "@/components/Brand";
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
      <Flex
        align="center"
        justify="center"
        style={{ minHeight: "100vh", background: "#fff" }}
      >
        <Typography.Text type="secondary">正在进入控制台…</Typography.Text>
      </Flex>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fff" }}>
      <div
        style={{
          borderBottom: "1px solid #f0f0f0",
          background: "#fff",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <Flex
          align="center"
          justify="space-between"
          style={{
            maxWidth: 1024,
            margin: "0 auto",
            padding: "0 24px",
            height: 56,
          }}
        >
          <Flex align="center" gap={24}>
            <Link href="/sandboxes">
              <Brand />
            </Link>
            <Menu
              mode="horizontal"
              selectedKeys={
                pathname.startsWith("/apikeys")
                  ? ["apikeys"]
                  : pathname.startsWith("/templates")
                    ? ["templates"]
                    : pathname.startsWith("/sandboxes")
                      ? ["sandboxes"]
                      : []
              }
              items={[
                {
                  key: "sandboxes",
                  label: <Link href="/sandboxes">沙箱</Link>,
                },
                {
                  key: "templates",
                  label: <Link href="/templates">模板</Link>,
                },
                {
                  key: "apikeys",
                  label: <Link href="/apikeys">API Key</Link>,
                },
              ]}
              style={{
                border: "none",
                background: "transparent",
                minWidth: 280,
                lineHeight: "54px",
              }}
            />
          </Flex>
          <Flex align="center" gap={12}>
            <Typography.Text type="secondary">{user?.username}</Typography.Text>
            <Button size="small" onClick={logout}>
              退出
            </Button>
          </Flex>
        </Flex>
      </div>
      <div
        style={{
          maxWidth: 1024,
          margin: "0 auto",
          padding: "24px",
          background: "#fff",
        }}
      >
        {children}
      </div>
    </div>
  );
}
