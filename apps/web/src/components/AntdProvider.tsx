import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { AppProvider, useProTheme } from 'listpage-components';

const THEME_STORAGE_KEY = 'sandbox-pro-theme';

type SandboxTheme = ReturnType<typeof useProTheme>;

const SandboxThemeContext = createContext<SandboxTheme | null>(null);

function readStoredThemeId() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function useSandboxTheme() {
  const theme = useContext(SandboxThemeContext);
  if (!theme) {
    throw new Error('useSandboxTheme 必须在 AntdProvider 内使用');
  }
  return theme;
}

export function AntdProvider({ children }: { children: ReactNode }) {
  const defaultThemeId = useMemo(() => readStoredThemeId(), []);
  const theme = useProTheme({ defaultThemeId });
  const { themeId } = theme;

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch {
      // ignore
    }
  }, [themeId]);

  return (
    <SandboxThemeContext.Provider value={theme}>
      <div className="sandbox-root">
        <AppProvider {...theme.appProviderProps}>{children}</AppProvider>
      </div>
    </SandboxThemeContext.Provider>
  );
}
