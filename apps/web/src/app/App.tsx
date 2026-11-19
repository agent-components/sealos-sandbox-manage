import {
  AppstoreOutlined,
  CloudServerOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import { App as AntdApp } from 'antd';
import { Layout, useLayoutTabs, type LayoutMenuSection } from 'listpage-components';
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSandboxTheme, AntdProvider } from '@/components/AntdProvider';
import { PRODUCT_NAME } from '@/modules/product';
import { getAppMode } from '@/modules/runtime/embed';
import { useLogin } from '@/modules/auth/useLogin';
import { BillingModal } from './components/BillingModal';
import { ClusterSettingsModal } from './components/ClusterSettingsModal';
import { McpConnectModal } from './components/McpConnectModal';
import { SystemSettingsModal } from './components/SystemSettingsModal';
import { EmbeddedBlockedPage } from '@/pages/login/EmbeddedBlockedPage';
import { LoginPage } from '@/pages/login/LoginPage';
import { CallLogListPage } from '@/pages/call-logs/CallLogListPage';
import { SandboxListPage } from '@/pages/sandboxes/SandboxListPage';
import { TemplateListPage } from '@/pages/templates/TemplateListPage';

type MenuKey = 'sandboxes' | 'templates' | 'call-logs';

const ROUTES = [
  {
    key: 'sandboxes' as const,
    label: '沙箱列表',
    icon: <CloudServerOutlined />,
    pinned: true,
  },
  {
    key: 'templates' as const,
    label: '模板管理',
    icon: <AppstoreOutlined />,
  },
  {
    key: 'call-logs' as const,
    label: '调用日志',
    icon: <FileSearchOutlined />,
  },
];

const TAB_ROUTES = ROUTES.map((route) => ({ ...route, path: `/${route.key}` }));

function menuKeyFromPath(pathname: string): MenuKey {
  const key = pathname.replace(/^\//, '') as MenuKey;
  return ROUTES.some((item) => item.key === key) ? key : 'sandboxes';
}

function PageSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 14 }}>
          加载中…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function Shell() {
  const appMode = useMemo(() => getAppMode(), []);
  const embedded = appMode === 'embedded';
  const { session, error, pending, ready, login, logout } = useLogin();
  const theme = useSandboxTheme();
  const [menuKey, setMenuKey] = useState<MenuKey>(() =>
    typeof window === 'undefined' ? 'sandboxes' : menuKeyFromPath(window.location.pathname),
  );
  const [clusterOpen, setClusterOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [openSandboxViewId, setOpenSandboxViewId] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.appMode = appMode;
  }, [appMode]);

  const navigateTab = useCallback((path: string) => {
    const key = menuKeyFromPath(path);
    setMenuKey(key);
    if (window.location.pathname !== `/${key}`) {
      window.history.replaceState(null, '', `/${key}${window.location.search}`);
    }
  }, []);

  const { tabs, activeKey, activateTab, closeTab, reorderTabs } = useLayoutTabs({
    routes: TAB_ROUTES,
    pathname: `/${menuKey}`,
    navigate: navigateTab,
    homepageKey: 'sandboxes',
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (!view || !session) return;
    setMenuKey('sandboxes');
    setOpenSandboxViewId(view);
    params.delete('view');
    const qs = params.toString();
    const next = `/${'sandboxes'}${qs ? `?${qs}` : ''}`;
    window.history.replaceState(null, '', next);
  }, [session]);

  const { themeUserProfileItem } = theme;
  const profileItems = useMemo(() => {
    const items = [
      {
        key: 'mcp',
        label: '接入 MCP',
        onClick: () => setMcpOpen(true),
      },
      {
        key: 'billing',
        label: '用量账单',
        onClick: () => setBillingOpen(true),
      },
      themeUserProfileItem,
    ];
    if (session?.role === 'ADMIN') {
      items.unshift(
        {
          key: 'system-settings',
          label: '系统设置',
          onClick: () => setSystemOpen(true),
        },
        {
          key: 'cluster-settings',
          label: '集群设置',
          onClick: () => setClusterOpen(true),
        },
      );
    }
    return items;
  }, [session?.role, themeUserProfileItem]);

  if (!ready) {
    return null;
  }

  if (!session) {
    if (embedded) {
      return <EmbeddedBlockedPage message={error || '请从 Harness Admin 打开'} />;
    }
    return (
      <AntdApp>
        <LoginPage error={error} pending={pending} onLogin={login} />
      </AntdApp>
    );
  }

  const goTemplates = () => {
    setMenuKey('templates');
    window.history.replaceState(null, '', `/templates${window.location.search}`);
  };

  let content: ReactNode = null;
  if (menuKey === 'sandboxes') {
    content = (
      <SandboxListPage
        initialViewSandboxId={openSandboxViewId}
        onConsumedInitialView={() => setOpenSandboxViewId(null)}
        onNavigateTemplates={goTemplates}
      />
    );
  } else if (menuKey === 'templates') {
    content = <TemplateListPage />;
  } else if (menuKey === 'call-logs') {
    content = <CallLogListPage />;
  }

  const shellModals = (
    <>
      <McpConnectModal open={mcpOpen} onClose={() => setMcpOpen(false)} />
      <BillingModal open={billingOpen} onClose={() => setBillingOpen(false)} />
      {session.role === 'ADMIN' ? (
        <>
          <ClusterSettingsModal open={clusterOpen} onClose={() => setClusterOpen(false)} />
          <SystemSettingsModal open={systemOpen} onClose={() => setSystemOpen(false)} />
        </>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <>
        <div className="app-embed">
          <PageSuspense>{content}</PageSuspense>
        </div>
        {shellModals}
      </>
    );
  }

  const menuSections: LayoutMenuSection[] = [
    {
      key: 'main',
      items: ROUTES.map((route) => ({
        key: route.key,
        label: route.label,
        icon: route.icon,
      })),
    },
  ];

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
        selectedMenuKey={menuKey}
        onMenuChange={(key) => {
          if (ROUTES.some((item) => item.key === key)) {
            navigateTab(`/${key}`);
          }
        }}
        userProfile={{
          name: session.displayName,
          items: profileItems,
          logout: {
            key: 'logout',
            label: '退出',
            onClick: () => void logout(),
          },
        }}
        tabs={{
          items: tabs.map((tab) => ({
            key: tab.key,
            label: tab.label,
            icon: tab.icon,
            closable: tab.key !== 'sandboxes',
            pinned: tab.key === 'sandboxes',
          })),
          activeKey,
          onChange: activateTab,
          onClose: closeTab,
          onReorder: reorderTabs,
        }}
      >
        <PageSuspense>{content}</PageSuspense>
      </Layout>
      {shellModals}
    </>
  );
}

export function App() {
  return (
    <AntdProvider>
      <AntdApp>
        <Shell />
      </AntdApp>
    </AntdProvider>
  );
}
