import type { SandboxState } from "@/modules/sandbox/schema";

const config: Record<SandboxState, { color: string; label: string }> = {
  running: { color: "#52c41a", label: "运行中" },
  starting: { color: "#faad14", label: "启动中" },
  stopped: { color: "rgba(0, 0, 0, 0.25)", label: "已停止" },
  error: { color: "#ff4d4f", label: "异常" },
};

export const sandboxStateOptions: { value: SandboxState; label: string }[] = (
  Object.entries(config) as [SandboxState, { label: string }][]
).map(([value, item]) => ({ value, label: item.label }));

export function StateBadge({ state }: { state: SandboxState }) {
  const item = config[state];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        color: "rgba(0, 0, 0, 0.65)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: item.color,
          flex: "none",
        }}
      />
      {item.label}
    </span>
  );
}
