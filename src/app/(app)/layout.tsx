import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            background: "#fff",
            color: "#8c8c8c",
            fontSize: 14,
          }}
        >
          加载中…
        </div>
      }
    >
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
