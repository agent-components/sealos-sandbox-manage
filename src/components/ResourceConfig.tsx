"use client";

import { Form, InputNumber, Slider, Space } from "antd";
import {
  CPU_OPTIONS,
  MEMORY_OPTIONS,
  nearestCpu,
  nearestMemoryGi,
  type ResourceSpec,
} from "@/lib/sealos/resources";

type Props = {
  value: ResourceSpec;
  onChange: (next: ResourceSpec) => void;
  disabled?: boolean;
  /** Sealos quota 不含磁盘；模板侧由独立 storage 配置。沙箱创建/改配可保留。 */
  showDisk?: boolean;
  /** form：模板表单 Form.Item；stack：沙箱详情 / 创建弹窗 */
  layout?: "form" | "stack";
};

function sliderMarks(labels: readonly string[]) {
  return Object.fromEntries(labels.map((label, index) => [index, label]));
}

export function ResourceConfig({
  value,
  onChange,
  disabled,
  showDisk = true,
  layout = "stack",
}: Props) {
  const cpuIndex = Math.max(0, CPU_OPTIONS.indexOf(nearestCpu(value.cpu)));
  const memoryIndex = Math.max(
    0,
    MEMORY_OPTIONS.findIndex((m) => m.gi === nearestMemoryGi(value.memoryGi)),
  );
  const cpuLabels = CPU_OPTIONS.map(String);
  const memoryLabels = MEMORY_OPTIONS.map((item) => item.label);

  const cpuSlider = (
    <Slider
      className="resource-slider"
      min={0}
      max={CPU_OPTIONS.length - 1}
      step={1}
      value={cpuIndex}
      disabled={disabled}
      tooltip={{ formatter: (i) => cpuLabels[i ?? 0] }}
      marks={sliderMarks(cpuLabels)}
      onChange={(i) =>
        onChange({
          ...value,
          cpu: CPU_OPTIONS[i]!,
        })
      }
    />
  );

  const memorySlider = (
    <Slider
      className="resource-slider"
      min={0}
      max={MEMORY_OPTIONS.length - 1}
      step={1}
      value={memoryIndex}
      disabled={disabled}
      tooltip={{ formatter: (i) => memoryLabels[i ?? 0] }}
      marks={sliderMarks(memoryLabels)}
      onChange={(i) =>
        onChange({
          ...value,
          memoryGi: MEMORY_OPTIONS[i]!.gi,
        })
      }
    />
  );

  const diskControl = (
    <Space.Compact>
      <InputNumber
        min={1}
        max={1000}
        step={1}
        value={value.diskGi}
        disabled={disabled}
        style={{ width: 160 }}
        onChange={(v) =>
          onChange({
            ...value,
            diskGi: Math.min(1000, Math.max(1, Number(v) || 1)),
          })
        }
      />
      <Space.Addon disabled={disabled}>Gi</Space.Addon>
    </Space.Compact>
  );

  if (layout === "form") {
    return (
      <>
        <Form.Item label="CPU" className="resource-config-form-item">
          {cpuSlider}
        </Form.Item>
        <Form.Item label="内存" className="resource-config-form-item">
          {memorySlider}
        </Form.Item>
        {showDisk ? (
          <Form.Item label="本地存储">{diskControl}</Form.Item>
        ) : null}
      </>
    );
  }

  return (
    <div
      className="resource-config"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        pointerEvents: disabled ? "none" : undefined,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div className="resource-slider-row">
        <div className="resource-slider-label">CPU</div>
        <div className="resource-slider-control">{cpuSlider}</div>
      </div>

      <div className="resource-slider-row">
        <div className="resource-slider-label">内存</div>
        <div className="resource-slider-control">{memorySlider}</div>
      </div>

      {showDisk ? (
        <div className="resource-slider-row">
          <div className="resource-slider-label">本地存储</div>
          <div className="resource-slider-control">{diskControl}</div>
        </div>
      ) : null}
    </div>
  );
}
