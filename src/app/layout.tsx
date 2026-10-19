import type { Metadata } from "next";
import { Suspense } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AntdProvider } from "@/components/AntdProvider";
import "../../node_modules/listpage-components/dist/AppProvider/index.css";
import "../../node_modules/listpage-components/dist/components/Layout/index.css";
import "../../node_modules/listpage-components/dist/components/ProTable/index.css";
import "../../node_modules/listpage-components/dist/components/ProDrawer/index.css";
import "../../node_modules/listpage-components/dist/components/ListPage/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "boat — 沙箱控制台",
  description: "为 Agent 与开发者打造的云端沙箱平台",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="h-full font-sans">
        <Suspense fallback={null}>
          <AntdProvider>{children}</AntdProvider>
        </Suspense>
      </body>
    </html>
  );
}
