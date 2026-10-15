import type { SandboxState } from "@/lib/sandbox/schema";
import { cn } from "@/lib/cn";

const styles: Record<SandboxState, string> = {
  running: "text-success",
  starting: "text-warning",
  stopped: "text-gray-500",
  error: "text-danger",
};

const labels: Record<SandboxState, string> = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  error: "Error",
};

const labelsZh: Record<SandboxState, string> = {
  running: "运行中",
  starting: "启动中",
  stopped: "已停止",
  error: "异常",
};

export function StateBadge({ state }: { state: SandboxState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        styles[state],
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          state === "starting" && "animate-pulse-dot",
        )}
      />
      {labelsZh[state]}
      <span className="sr-only">{labels[state]}</span>
    </span>
  );
}
