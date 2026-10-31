"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Collapse,
  DatePicker,
  Empty,
  Modal,
  Space,
  Spin,
  Typography,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import {
  sandboxClient,
  type BillingReport,
  type BillingUsage,
  type SandboxBillingRow,
} from "@/lib/client";

function yuan(value: number) {
  return `¥${value.toFixed(4)}`;
}

const METRICS: Array<{
  costKey: keyof BillingUsage;
  label: string;
}> = [
    { costKey: "cpuCost", label: "CPU" },
    { costKey: "memoryCost", label: "内存" },
    { costKey: "storageCost", label: "存储" },
    { costKey: "portCost", label: "端口" },
  ];

function CostGrid({ usage }: { usage: BillingUsage }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 10,
      }}
    >
      {METRICS.map((metric) => (
        <div
          key={metric.label}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--ant-color-fill-quaternary)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "var(--ant-color-text-secondary)",
              marginBottom: 4,
            }}
          >
            {metric.label}
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              lineHeight: 1.3,
              color: "var(--ant-color-text)",
            }}
          >
            {yuan(usage[metric.costKey] as number)}
          </div>
        </div>
      ))}
    </div>
  );
}

function SandboxBlock({ row }: { row: SandboxBillingRow }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 10,
        border: "1px solid var(--ant-color-border-secondary)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "baseline",
          marginBottom: 12,
        }}
      >
        <Typography.Text
          strong
          style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}
        >
          {row.sandboxId}
        </Typography.Text>
        <Typography.Text
          strong
          style={{ whiteSpace: "nowrap", fontSize: 18 }}
        >
          {yuan(row.totalCost)}
        </Typography.Text>
      </div>
      <CostGrid usage={row} />
    </div>
  );
}

export function BillingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs(),
  ]);
  const [report, setReport] = useState<BillingReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await sandboxClient.getBilling({
        from: range[0].toISOString(),
        to: range[1].toISOString(),
      });
      setReport(next);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载失败");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [message, range]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const regions = report?.regions ?? [];
  const total = report?.total ?? null;

  return (
    <Modal
      title="用量账单"
      open={open}
      onCancel={onClose}
      footer={null}
      width={880}
      centered
      destroyOnHidden
      styles={{ body: { maxHeight: "70vh", overflow: "auto" } }}
    >
      <Space orientation="vertical" size={20} style={{ width: "100%" }}>
        <Space wrap>
          <Typography.Text type="secondary">统计区间</Typography.Text>
          <DatePicker.RangePicker
            showTime
            value={range}
            style={{ width: 360 }}
            placeholder={["开始", "结束"]}
            presets={[
              {
                label: "本月",
                value: [dayjs().startOf("month"), dayjs()],
              },
              {
                label: "近 7 天",
                value: [dayjs().subtract(7, "day"), dayjs()],
              },
              {
                label: "近 30 天",
                value: [dayjs().subtract(30, "day"), dayjs()],
              },
            ]}
            onChange={(value) => {
              if (value?.[0] && value[1]) {
                setRange([value[0], value[1]]);
              }
            }}
          />
        </Space>

        {total ? (
          <div
            style={{
              padding: "16px 18px",
              borderRadius: 10,
              border: "1px solid var(--ant-color-border-secondary)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <Typography.Text strong style={{ fontSize: 15 }}>
                全部区域合计
              </Typography.Text>
              <Typography.Text strong style={{ fontSize: 22, lineHeight: 1.2 }}>
                {yuan(total.totalCost)}
              </Typography.Text>
            </div>
            <CostGrid usage={total} />
          </div>
        ) : null}

        <Spin spinning={loading}>
          {regions.length === 0 && !loading ? (
            <Empty description="该区间暂无用量" />
          ) : (
            <Collapse
              defaultActiveKey={regions.map((r) => r.regionId)}
              items={regions.map((region) => ({
                key: region.regionId,
                label: (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 16,
                      width: "100%",
                      paddingRight: 8,
                    }}
                  >
                    <Space size={8} wrap>
                      <Typography.Text strong style={{ fontSize: 15 }}>
                        {region.regionName}
                      </Typography.Text>
                      <Typography.Text
                        type="secondary"
                        style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                      >
                        {region.regionId}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        {region.sandboxes.length} 台沙箱
                      </Typography.Text>
                    </Space>
                    <Typography.Text strong style={{ fontSize: 16 }}>
                      {yuan(region.totalCost)}
                    </Typography.Text>
                  </div>
                ),
                children: (
                  <Space
                    orientation="vertical"
                    size={14}
                    style={{ width: "100%" }}
                  >
                    <CostGrid usage={region} />
                    {region.sandboxes.map((row) => (
                      <SandboxBlock key={row.sandboxId} row={row} />
                    ))}
                  </Space>
                ),
              }))}
            />
          )}
        </Spin>
      </Space>
    </Modal>
  );
}
