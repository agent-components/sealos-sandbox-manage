"use client";

import {
  CPU_OPTIONS,
  MEMORY_OPTIONS,
  type ResourceSpec,
} from "@/lib/sealos/resources";
import { Input } from "@/components/ui/Input";

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
    <div className="space-y-8">
      <div className="grid grid-cols-[3.5rem_1fr] items-center gap-x-5 sm:grid-cols-[4.5rem_1fr]">
        <span className="text-sm text-muted">CPU</span>
        <div className="space-y-2.5">
          <p className="font-mono text-sm text-brand">
            {value.cpu}
            <span className="ml-1 text-muted">核</span>
          </p>
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
            className="slider"
          />
          <div className="flex justify-between font-mono text-[10px] text-muted sm:text-[11px]">
            {CPU_OPTIONS.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[3.5rem_1fr] items-center gap-x-5 sm:grid-cols-[4.5rem_1fr]">
        <span className="text-sm text-muted">内存</span>
        <div className="space-y-2.5">
          <p className="font-mono text-sm text-brand">
            {MEMORY_OPTIONS[memoryIndex]?.label}
          </p>
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
            className="slider"
          />
          <div className="flex justify-between font-mono text-[10px] text-muted sm:text-[11px]">
            {MEMORY_OPTIONS.map((m) => (
              <span key={m.label}>{m.label}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[3.5rem_1fr] items-center gap-x-5 sm:grid-cols-[4.5rem_1fr]">
        <span className="text-sm text-muted">磁盘</span>
        <div className="flex items-center gap-2">
          <Input
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
            className="w-28"
          />
          <span className="text-sm text-muted">Gi</span>
        </div>
      </div>
    </div>
  );
}
