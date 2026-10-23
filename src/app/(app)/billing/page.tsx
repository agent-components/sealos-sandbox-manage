"use client";

import { useCallback, useMemo, useState } from "react";
import { App, Card, Col, DatePicker, Row, Statistic, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import {
  ListPage,
  type FilterItem,
} from "listpage-components/ListPage";
import { HydratedProTable } from "@/components/list-page";
import {
  sandboxClient,
  type BillingReport,
  type SandboxBillingRow,
} from "@/lib/client";
import { billingColumns } from "./columns";

type BillingFilters = {
  range?: [Dayjs, Dayjs] | null;
};

function formatYuan(value: number) {
  return `¥${value.toFixed(4)}`;
}

function SummaryCards({ total }: { total: BillingReport["total"] | null }) {
  const items = [
    { title: "合计", value: total ? formatYuan(total.totalCost) : "—" },
    { title: "CPU", value: total ? formatYuan(total.cpuCost) : "—" },
    { title: "内存", value: total ? formatYuan(total.memoryCost) : "—" },
    { title: "存储卷", value: total ? formatYuan(total.storageCost) : "—" },
    { title: "公网端口", value: total ? formatYuan(total.portCost) : "—" },
  ];
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      {items.map((item) => (
        <Col key={item.title} xs={12} sm={8} md={4} lg={4} xl={4}>
          <Card size="small">
            <Statistic title={item.title} value={item.value} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}

export default function BillingPage() {
  const { message } = App.useApp();
  const [total, setTotal] = useState<BillingReport["total"] | null>(null);
  const [rangeLabel, setRangeLabel] = useState("");

  const request = useCallback(
    async (
      _page: { current: number; pageSize: number },
      filters: BillingFilters,
    ) => {
      try {
        const range = filters.range;
        const from = range?.[0]?.toISOString();
        const to = range?.[1]?.toISOString();
        const report = await sandboxClient.getBilling({
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        });
        setTotal(report.total);
        setRangeLabel(
          `${dayjs(report.from).format("YYYY-MM-DD HH:mm")} ~ ${dayjs(report.to).format("YYYY-MM-DD HH:mm")}`,
        );
        return { list: report.sandboxes, total: report.sandboxes.length };
      } catch (err) {
        message.error(err instanceof Error ? err.message : "加载失败");
        setTotal(null);
        return { list: [] as SandboxBillingRow[], total: 0 };
      }
    },
    [message],
  );

  const columns = useMemo(() => billingColumns(), []);
  const filterItems = useMemo<FilterItem<BillingFilters>[]>(
    () => [
      {
        name: "range",
        label: "统计区间",
        colSpan: 5 as const,
        component: (
          <DatePicker.RangePicker
            showTime
            style={{ width: "100%" }}
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
          />
        ),
      },
    ],
    [],
  );

  return (
    <ListPage<SandboxBillingRow, BillingFilters>
      title={
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            用量账单
          </Typography.Title>
          <Typography.Paragraph
            type="secondary"
            style={{ margin: "8px 0 0", maxWidth: 720 }}
          >
            按 Sealos 广州可用区口径估算：运行中计 CPU、内存与公网端口；存储卷在沙箱保留期间持续计费。不含外网流量，不计功能上线前的历史用量。
            {rangeLabel ? ` 当前区间：${rangeLabel}` : ""}
          </Typography.Paragraph>
          <SummaryCards total={total} />
        </div>
      }
      filter={{ items: filterItems }}
      table={{
        render: () => (
          <HydratedProTable
            columns={columns}
            title="按沙箱"
            widthKey="sandbox-billing-width"
            columnKey="sandbox-billing-columns"
            scroll={{ x: 1100, y: "calc(100vh - 480px)" }}
          />
        ),
      }}
      request={request}
      initialValues={{
        pageSize: 100,
        filterValues: {
          range: [dayjs().startOf("month"), dayjs()] as [Dayjs, Dayjs],
        },
      }}
    />
  );
}
