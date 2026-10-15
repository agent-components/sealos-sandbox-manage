/** 与 Sealos 控制台一致的离散档位 */

export const CPU_OPTIONS = [0.5, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export type CpuOption = (typeof CPU_OPTIONS)[number];

/** 内存档位：展示文案 + Launchpad 使用的 Gi 数值 */
export const MEMORY_OPTIONS = [
  { label: "512Mi", gi: 0.5 },
  { label: "1G", gi: 1 },
  { label: "2G", gi: 2 },
  { label: "4G", gi: 4 },
  { label: "6G", gi: 6 },
  { label: "8G", gi: 8 },
  { label: "12G", gi: 12 },
  { label: "16G", gi: 16 },
  { label: "32G", gi: 32 },
] as const;

export type MemoryOption = (typeof MEMORY_OPTIONS)[number];

export const DEFAULT_RESOURCES = {
  cpu: 0.5 as CpuOption,
  memoryGi: 0.5,
  diskGi: 3,
};

export type ResourceSpec = {
  cpu: number;
  memoryGi: number;
  diskGi: number;
};

export function memoryLabel(gi: number): string {
  const hit = MEMORY_OPTIONS.find((m) => m.gi === gi);
  return hit?.label ?? `${gi}G`;
}

export function nearestCpu(value?: number): CpuOption {
  if (value == null || Number.isNaN(value)) return DEFAULT_RESOURCES.cpu;
  let best: CpuOption = CPU_OPTIONS[0];
  let bestDiff = Math.abs(value - best);
  for (const opt of CPU_OPTIONS) {
    const diff = Math.abs(value - opt);
    if (diff < bestDiff) {
      best = opt;
      bestDiff = diff;
    }
  }
  return best;
}

export function nearestMemoryGi(value?: number): number {
  if (value == null || Number.isNaN(value)) return DEFAULT_RESOURCES.memoryGi;
  let best: number = MEMORY_OPTIONS[0].gi;
  let bestDiff = Math.abs(value - best);
  for (const opt of MEMORY_OPTIONS) {
    const diff = Math.abs(value - opt.gi);
    if (diff < bestDiff) {
      best = opt.gi;
      bestDiff = diff;
    }
  }
  return best;
}

export function clampDiskGi(value?: number): number {
  if (value == null || Number.isNaN(value)) return DEFAULT_RESOURCES.diskGi;
  return Math.min(1000, Math.max(1, Math.round(value)));
}
