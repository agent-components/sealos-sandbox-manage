import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-full max-w-5xl items-center px-6 py-20 text-muted">
          加载中…
        </main>
      }
    >
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
