"use client";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { createContext, useContext, useEffect, useRef } from "react";
import { AppProvider, useProTheme } from "listpage-components";

const THEME_STORAGE_KEY = "sandbox-pro-theme";

type BoatTheme = ReturnType<typeof useProTheme>;

const BoatThemeContext = createContext<BoatTheme | null>(null);

export function useBoatTheme() {
  const theme = useContext(BoatThemeContext);
  if (!theme) {
    throw new Error("useBoatTheme 必须在 AntdProvider 内使用");
  }
  return theme;
}

export function AntdProvider({ children }: { children: React.ReactNode }) {
  const theme = useProTheme();
  const { themeId, setThemeId } = theme;
  const restored = useRef(false);

  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved && saved !== themeId) setThemeId(saved);
      return;
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
  }, [setThemeId, themeId]);

  return (
    <AntdRegistry>
      <BoatThemeContext.Provider value={theme}>
        <div className="sandbox-root">
          <AppProvider {...theme.appProviderProps}>{children}</AppProvider>
        </div>
      </BoatThemeContext.Provider>
    </AntdRegistry>
  );
}
