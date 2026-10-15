import { Tag } from "antd";
import type { SandboxState } from "@/lib/sandbox/schema";

const config: Record<
  SandboxState,
  { color: string; label: string }
> = {
  running: { color: "success", label: "运行中" },
  starting: { color: "warning", label: "启动中" },
  stopped: { color: "default", label: "已停止" },
  error: { color: "error", label: "异常" },
};

export function StateBadge({ state }: { state: SandboxState }) {
  const item = config[state];
  return <Tag color={item.color}>{item.label}</Tag>;
}
