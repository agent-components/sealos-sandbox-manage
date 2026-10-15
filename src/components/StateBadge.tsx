import type { SandboxState } from "@/lib/sandbox/schema";

const styles: Record<SandboxState, string> = {
  running:
    "border-[rgba(15,159,117,0.35)] bg-[rgba(15,159,117,0.1)] text-[var(--accent-dim)]",
  starting:
    "border-[rgba(197,138,18,0.35)] bg-[rgba(197,138,18,0.1)] text-[var(--warn)]",
  stopped:
    "border-[var(--border)] bg-[var(--bg-panel)] text-[var(--fg-muted)]",
  error:
    "border-[rgba(214,69,93,0.35)] bg-[rgba(214,69,93,0.08)] text-[var(--danger)]",
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${styles[state]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${state === "starting" ? "animate-pulse-soft bg-current" : "bg-current"
          }`}
      />
      {labels[state]}
    </span>
  );
}
