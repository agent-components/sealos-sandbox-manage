import type { Dayjs } from "dayjs";
import { boatClient } from "@/lib/client";

export type McpLogRow = Awaited<
  ReturnType<typeof boatClient.listMcpLogs>
>["logs"][number];

export type McpLogFilters = {
  apiKeyId?: string;
  range?: [Dayjs, Dayjs] | null;
};

export function formatTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function formatDuration(ms?: number | null) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} m ${rest} s`;
}

export function sandboxIdOf(args: Record<string, unknown> | undefined) {
  const id = args?.id;
  return typeof id === "string" && id.trim() ? id : "";
}
