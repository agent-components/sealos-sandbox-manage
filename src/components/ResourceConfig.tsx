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
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label className="text-sm font-medium">CPU</label>
          <span className="font-mono text-sm text-gray-600">
            {value.cpu} 核
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
          className="slider"
        />
        <div className="flex justify-between font-mono text-[11px] text-gray-500">
          {CPU_OPTIONS.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label className="text-sm font-medium">内存</label>
          <span className="font-mono text-sm text-gray-600">
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
          className="slider"
        />
        <div className="flex justify-between font-mono text-[11px] text-gray-500">
          {MEMORY_OPTIONS.map((m) => (
            <span key={m.label}>{m.label}</span>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">磁盘</label>
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
          <span className="text-sm text-gray-600">Gi</span>
        </div>
      </div>
    </div>
  );
}
