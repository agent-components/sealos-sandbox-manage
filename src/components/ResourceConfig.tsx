"use client";

import { InputNumber, Slider } from "antd";
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
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-medium">CPU</span>
          <span className="font-mono text-sm text-gray-600">
            {value.cpu} 核
          </span>
        </div>
        <Slider
          min={0}
          max={CPU_OPTIONS.length - 1}
          step={1}
          disabled={disabled}
          value={cpuIndex}
          tooltip={{
            formatter: (i) => `${CPU_OPTIONS[i ?? 0]} 核`,
          }}
          marks={Object.fromEntries(
            CPU_OPTIONS.map((c, i) => [i, String(c)]),
          )}
          onChange={(i) =>
            onChange({
              ...value,
              cpu: CPU_OPTIONS[i]!,
            })
          }
        />
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-medium">内存</span>
          <span className="font-mono text-sm text-gray-600">
            {MEMORY_OPTIONS[memoryIndex]?.label}
          </span>
        </div>
        <Slider
          min={0}
          max={MEMORY_OPTIONS.length - 1}
          step={1}
          disabled={disabled}
          value={memoryIndex}
          tooltip={{
            formatter: (i) => MEMORY_OPTIONS[i ?? 0]?.label,
          }}
          marks={Object.fromEntries(
            MEMORY_OPTIONS.map((m, i) => [i, m.label]),
          )}
          onChange={(i) =>
            onChange({
              ...value,
              memoryGi: MEMORY_OPTIONS[i]!.gi,
            })
          }
        />
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">磁盘</div>
        <InputNumber
          min={1}
          max={1000}
          step={1}
          disabled={disabled}
          value={value.diskGi}
          addonAfter="Gi"
          style={{ width: 160 }}
          onChange={(v) =>
            onChange({
              ...value,
              diskGi: Math.min(1000, Math.max(1, Number(v) || 1)),
            })
          }
        />
      </div>
    </div>
  );
}
