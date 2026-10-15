"use client";

import {
  CPU_OPTIONS,
  MEMORY_OPTIONS,
  type ResourceSpec,
} from "@/lib/sealos/resources";

type Props = {
  value: ResourceSpec;
  onChange: (next: ResourceSpec) => void;
  disabled?: boolean;
};

export function ResourceConfig({ value, onChange, disabled }: Props) {
  const cpuIndex = Math.max(
    0,
    CPU_OPTIONS.findIndex((c) => c === value.cpu),
  );
  const memoryIndex = Math.max(
    0,
    MEMORY_OPTIONS.findIndex((m) => m.gi === value.memoryGi),
  );

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-[3.5rem_1fr] items-center gap-x-5 gap-y-2 sm:grid-cols-[4.5rem_1fr]">
        <span className="text-sm text-[var(--fg-muted)]">CPU</span>
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-sm text-[var(--accent)]">
              {value.cpu}
              <span className="ml-1 text-[var(--fg-muted)]">核</span>
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={CPU_OPTIONS.length - 1}
            step={1}
            disabled={disabled}
            value={cpuIndex}
            onChange={(e) =>
              onChange({
                ...value,
                cpu: CPU_OPTIONS[Number(e.target.value)]!,
              })
            }
            className="resource-range"
          />
          <div className="flex justify-between font-mono text-[10px] text-[var(--fg-muted)] sm:text-[11px]">
            {CPU_OPTIONS.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[3.5rem_1fr] items-center gap-x-5 gap-y-2 sm:grid-cols-[4.5rem_1fr]">
        <span className="text-sm text-[var(--fg-muted)]">内存</span>
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-sm text-[var(--accent)]">
              {MEMORY_OPTIONS[memoryIndex]?.label}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={MEMORY_OPTIONS.length - 1}
            step={1}
            disabled={disabled}
            value={memoryIndex}
            onChange={(e) =>
              onChange({
                ...value,
                memoryGi: MEMORY_OPTIONS[Number(e.target.value)]!.gi,
              })
            }
            className="resource-range"
          />
          <div className="flex justify-between font-mono text-[10px] text-[var(--fg-muted)] sm:text-[11px]">
            {MEMORY_OPTIONS.map((m) => (
              <span key={m.label}>{m.label}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[3.5rem_1fr] items-center gap-x-5 sm:grid-cols-[4.5rem_1fr]">
        <span className="text-sm text-[var(--fg-muted)]">磁盘</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={1000}
            step={1}
            disabled={disabled}
            value={value.diskGi}
            onChange={(e) =>
              onChange({
                ...value,
                diskGi: Math.min(
                  1000,
                  Math.max(1, Number(e.target.value) || 1),
                ),
              })
            }
            className="input-field !w-28"
          />
          <span className="text-sm text-[var(--fg-muted)]">Gi</span>
        </div>
      </div>
    </div>
  );
}
