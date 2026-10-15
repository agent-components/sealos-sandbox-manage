"use client";

import { Form, InputNumber, Slider } from "antd";
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
  const memoryLast = MEMORY_OPTIONS.length - 1;

  return (
    <Form layout="vertical" disabled={disabled}>
      <Form.Item
        label="CPU"
        extra={`${value.cpu} 核`}
        style={{ marginBottom: 20 }}
      >
        <Slider
          min={0}
          max={CPU_OPTIONS.length - 1}
          step={1}
          value={cpuIndex}
          tooltip={{ formatter: (i) => `${CPU_OPTIONS[i ?? 0]} 核` }}
          marks={{
            0: String(CPU_OPTIONS[0]),
            [CPU_OPTIONS.length - 1]: String(
              CPU_OPTIONS[CPU_OPTIONS.length - 1],
            ),
          }}
          onChange={(i) =>
            onChange({
              ...value,
              cpu: CPU_OPTIONS[i]!,
            })
          }
        />
      </Form.Item>

      <Form.Item
        label="内存"
        extra={MEMORY_OPTIONS[memoryIndex]?.label}
        style={{ marginBottom: 20 }}
      >
        <Slider
          min={0}
          max={memoryLast}
          step={1}
          value={memoryIndex}
          tooltip={{ formatter: (i) => MEMORY_OPTIONS[i ?? 0]?.label }}
          marks={{
            0: MEMORY_OPTIONS[0]!.label,
            [memoryLast]: MEMORY_OPTIONS[memoryLast]!.label,
          }}
          onChange={(i) =>
            onChange({
              ...value,
              memoryGi: MEMORY_OPTIONS[i]!.gi,
            })
          }
        />
      </Form.Item>

      <Form.Item label="磁盘" style={{ marginBottom: 0 }}>
        <InputNumber
          min={1}
          max={1000}
          step={1}
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
      </Form.Item>
    </Form>
  );
}
