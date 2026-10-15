import type { SandboxState } from "@/lib/sandbox/schema";
import { cn } from "@/lib/cn";

const styles: Record<SandboxState, string> = {
  running: "border-brand/25 bg-brand-soft text-brand-deep",
  starting: "border-warn/30 bg-warn-soft text-warn",
  stopped: "border-line bg-canvas text-muted",
  error: "border-danger/25 bg-danger-soft text-danger",
};

const labels: Record<SandboxState, string> = {
  running: "运行中",
  starting: "启动中",
  stopped: "已停止",
  error: "异常",
};

export function StateBadge({ state }: { state: SandboxState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[state],
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          state === "starting" && "animate-pulse-dot",
        )}
      />
      {labels[state]}
    </span>
  );
}
