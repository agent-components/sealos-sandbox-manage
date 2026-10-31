"use client";

import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  AccountBookOutlined,
  CloudServerOutlined,
  FileSearchOutlined,
  KeyOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { Layout, useLayoutTabs } from "listpage-components/Layout";
import { useSandboxTheme } from "@/components/AntdProvider";
import { ClusterSettingsModal } from "@/components/ClusterSettingsModal";
import { sandboxClient, type SandboxUser } from "@/lib/client";
import { PRODUCT_NAME } from "@/lib/product";

const ROUTES = [
  {
    key: "sandboxes",
    path: "/sandboxes",
    label: "沙箱列表",
    icon: <CloudServerOutlined />,
    pinned: true,
  },
  {
    key: "templates",
    path: "/templates",
    label: "模板管理",
    icon: <AppstoreOutlined />,
  },
  {
    key: "mcp-logs",
    path: "/mcp-logs",
    label: "调用日志",
    icon: <FileSearchOutlined />,
  },
  {
    key: "billing",
    path: "/billing",
    label: "用量账单",
    icon: <AccountBookOutlined />,
  },
  {
    key: "apikeys",
    path: "/apikeys",
    label: "令牌管理",
    icon: <KeyOutlined />,
  },
];

function tabPathOf(pathname: string) {
  return ROUTES.find((route) => pathname.startsWith(route.path))?.path ?? pathname;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useSandboxTheme();
  const [user, setUser] = useState<SandboxUser | null>(null);
  const [clusterOpen, setClusterOpen] = useState(false);
  const tabPath = tabPathOf(pathname);

  const { tabs, activeKey, activateTab, closeTab, reorderTabs } = useLayoutTabs({
    routes: ROUTES,
    pathname: tabPath,
    navigate: (path) => router.push(path),
    homepageKey: "sandboxes",
  });

  useEffect(() => {
    let cancelled = false;
    sandboxClient
      .me()
      .then((res) => {
        if (cancelled) return;
        if (!res.authenticated || !res.user) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        setUser(res.user);
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  async function logout() {
    await sandboxClient.logout();
    router.replace("/login");
  }

  const menuSections = useMemo(
    () => [
      {
        key: "main",
        items: ROUTES.filter((route) => route.key !== "billing").map(
          (route) => ({
            key: route.key,
            label: route.label,
            icon: route.icon,
          }),
        ),
      },
    ],
    [],
  );

  const selectedKey =
    ROUTES.find((route) => route.path === tabPath)?.key ?? "sandboxes";

  const profileItems = useMemo(() => {
    const items = [
      {
        key: "billing",
        label: "用量账单",
        onClick: () => router.push("/billing"),
      },
      theme.themeUserProfileItem,
    ];
    if (user?.role === "ADMIN") {
      items.unshift({
        key: "cluster-settings",
        label: "集群设置",
        onClick: () => setClusterOpen(true),
      });
    }
    return items;
  }, [theme.themeUserProfileItem, user?.role, router]);

  return (
    <>
      <Layout
        title={PRODUCT_NAME}
        logo={<img src="/logo.png" alt="" className="sandbox-logo" />}
        height="fill"
        contentPadding={24}
        menuVariant="inline"
        sidebarTheme={theme.sidebarTheme}
        menuSections={menuSections}
        selectedMenuKey={selectedKey}
        onMenuChange={(key) => {
          const route = ROUTES.find((item) => item.key === key);
          if (route) router.push(route.path);
        }}
        userProfile={
          user
            ? {
              name: user.displayName,
              items: profileItems,
              logout: {
                key: "logout",
                label: "退出",
                onClick: () => {
                  void logout();
                },
              },
            }
            : undefined
        }
        tabs={{
          items: tabs.map((tab) => ({
            key: tab.key,
            label: tab.label,
            icon: tab.icon,
            closable: tab.key !== "sandboxes",
            pinned: tab.key === "sandboxes",
          })),
          activeKey,
          onChange: activateTab,
          onClose: closeTab,
          onReorder: reorderTabs,
        }}
      >
        <Suspense
          fallback={
            <div style={{ color: "var(--ant-color-text-secondary)", fontSize: 14 }}>
              加载中…
            </div>
          }
        >
          {children}
        </Suspense>
      </Layout>
      {user?.role === "ADMIN" ? (
        <ClusterSettingsModal
          open={clusterOpen}
          onClose={() => setClusterOpen(false)}
        />
      ) : null}
    </>
  );
}
