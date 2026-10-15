"use client";

import { Flex, InputNumber, Slider, Typography } from "antd";
import {
  CPU_OPTIONS,
  MEMORY_OPTIONS,
  type ResourceSpec,
} from "@/lib/sealos/resources";

type Props = {
  value: ResourceSpec;
  onChange: (next: ResourceSpec) => void;
  disabled?: boolean;
  /** Sealos quota 不含磁盘；模板侧由独立 storage 配置。沙箱创建/改配可保留。 */
  showDisk?: boolean;
};

function FieldLabel({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <Flex align="baseline" justify="space-between" style={{ marginBottom: 8 }}>
      <Typography.Text style={{ color: "rgba(0,0,0,0.88)" }}>{title}</Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {value}
      </Typography.Text>
    </Flex>
  );
}

export function ResourceConfig({
  value,
  onChange,
  disabled,
  showDisk = true,
}: Props) {
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
    <div
      className="resource-config"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 28,
        pointerEvents: disabled ? "none" : undefined,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div>
        <FieldLabel title="CPU" value={`${value.cpu} 核`} />
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
      </div>

      <div>
        <FieldLabel
          title="内存"
          value={MEMORY_OPTIONS[memoryIndex]?.label ?? `${value.memoryGi}G`}
        />
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
      </div>

      {showDisk ? (
        <div>
          <FieldLabel title="本地存储" value={`${value.diskGi} Gi`} />
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
        </div>
      ) : null}
    </div>
  );
}
