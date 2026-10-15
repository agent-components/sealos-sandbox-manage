"use client";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

export function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: "#1677ff",
            colorInfo: "#1677ff",
            colorSuccess: "#389e0d",
            colorWarning: "#d48806",
            colorError: "#cf1322",
            colorText: "#1f1f1f",
            colorTextSecondary: "#8c8c8c",
            colorBorder: "#f0f0f0",
            colorBorderSecondary: "#f5f5f5",
            colorBgBase: "#ffffff",
            colorBgLayout: "#ffffff",
            colorBgContainer: "#ffffff",
            colorBgElevated: "#ffffff",
            colorFillAlter: "#fafafa",
            borderRadius: 8,
            fontFamily:
              "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
            controlHeight: 36,
          },
          components: {
            Button: {
              primaryShadow: "none",
              defaultShadow: "none",
              dangerShadow: "none",
            },
            Table: {
              headerBg: "#fafafa",
              headerColor: "#8c8c8c",
              headerSplitColor: "transparent",
              borderColor: "#f0f0f0",
              rowHoverBg: "#fafafa",
              cellPaddingBlockSM: 6,
              cellPaddingInlineSM: 12,
              cellPaddingBlock: 6,
              cellPaddingInline: 12,
              fontWeightStrong: 500,
            },
            Modal: {
              contentBg: "#ffffff",
              headerBg: "#ffffff",
              footerBg: "#ffffff",
            },
            Slider: {
              trackBg: "#91caff",
              trackHoverBg: "#69b1ff",
              railBg: "#f5f5f5",
              railHoverBg: "#f0f0f0",
              handleColor: "#1677ff",
              handleActiveColor: "#0958d9",
              dotBorderColor: "#d9d9d9",
              dotActiveBorderColor: "#1677ff",
            },
            Tag: {
              defaultBg: "#fafafa",
              defaultColor: "#595959",
            },
          },
        }}
      >
        <App>{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
