import {
  AppstoreOutlined,
  CloudServerOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import { App as AntdApp } from 'antd';
import { Layout, useLayoutTabs, type LayoutMenuSection } from 'listpage-components';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { BillingModal } from '@/components/BillingModal';
import { ClusterSettingsModal } from '@/components/ClusterSettingsModal';
import { SystemSettingsModal } from '@/components/SystemSettingsModal';
import { useSandboxTheme, AntdProvider } from '@/components/AntdProvider';
import { PRODUCT_NAME } from '@/lib/product';
import { useLogin } from '../modules/auth/useLogin';
import { LoginPage } from '../pages/login/LoginPage';
import { CallLogListPage } from '../pages/call-logs/CallLogListPage';
import { SandboxListPage } from '../pages/sandboxes/SandboxListPage';
import { TemplateListPage } from '../pages/templates/TemplateListPage';

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

function Shell() {
  const { session, error, pending, ready, login, logout } = useLogin();
  const theme = useSandboxTheme();
  const [menuKey, setMenuKey] = useState<MenuKey>('sandboxes');
  const [clusterOpen, setClusterOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [openSandboxViewId, setOpenSandboxViewId] = useState<string | null>(null);

  const navigateTab = useCallback((path: string) => {
    const key = path.replace(/^\//, '') as MenuKey;
    if (ROUTES.some((item) => item.key === key)) setMenuKey(key);
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
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    window.history.replaceState(null, '', next);
  }, [session]);

  const { themeUserProfileItem } = theme;
  const profileItems = useMemo(() => {
    const items = [
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
    return (
      <AntdApp>
        <LoginPage error={error} pending={pending} onLogin={login} />
      </AntdApp>
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

  let content = null;
  if (menuKey === 'sandboxes') {
    content = (
      <SandboxListPage
        initialViewSandboxId={openSandboxViewId}
        onConsumedInitialView={() => setOpenSandboxViewId(null)}
        onNavigateTemplates={() => setMenuKey('templates')}
      />
    );
  } else if (menuKey === 'templates') {
    content = <TemplateListPage />;
  } else if (menuKey === 'call-logs') {
    content = <CallLogListPage />;
  }

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
            setMenuKey(key as MenuKey);
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
        <Suspense
          fallback={
            <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 14 }}>
              加载中…
            </div>
          }
        >
          {content}
        </Suspense>
      </Layout>
      <BillingModal open={billingOpen} onClose={() => setBillingOpen(false)} />
      {session.role === 'ADMIN' ? (
        <>
          <ClusterSettingsModal open={clusterOpen} onClose={() => setClusterOpen(false)} />
          <SystemSettingsModal open={systemOpen} onClose={() => setSystemOpen(false)} />
        </>
      ) : null}
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