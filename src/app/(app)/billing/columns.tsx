"use client";

import type { ListPageColumnType } from "listpage-components/ListPage";
import type { SandboxBillingRow } from "@/lib/client";

function yuan(value: number) {
  return `¥${value.toFixed(4)}`;
}

function hours(value: number) {
  return value.toFixed(4);
}

export function billingColumns(): ListPageColumnType<SandboxBillingRow>[] {
  return [
    {
      title: "沙箱",
      dataIndex: "sandboxId",
      key: "sandboxId",
      width: 200,
      ellipsis: true,
    },
    {
      title: "合计",
      dataIndex: "totalCost",
      key: "totalCost",
      width: 110,
      sorter: (a, b) => a.totalCost - b.totalCost,
      render: (_, row) => yuan(row.totalCost),
    },
    {
      title: "CPU 费用",
      dataIndex: "cpuCost",
      key: "cpuCost",
      width: 100,
      render: (_, row) => yuan(row.cpuCost),
    },
    {
      title: "CPU 核时",
      dataIndex: "cpuCoreHours",
      key: "cpuCoreHours",
      width: 100,
      render: (_, row) => hours(row.cpuCoreHours),
    },
    {
      title: "内存费用",
      dataIndex: "memoryCost",
      key: "memoryCost",
      width: 100,
      render: (_, row) => yuan(row.memoryCost),
    },
    {
      title: "内存 GB·时",
      dataIndex: "memoryGiHours",
      key: "memoryGiHours",
      width: 110,
      render: (_, row) => hours(row.memoryGiHours),
    },
    {
      title: "存储费用",
      dataIndex: "storageCost",
      key: "storageCost",
      width: 100,
      render: (_, row) => yuan(row.storageCost),
    },
    {
      title: "存储 GB·时",
      dataIndex: "storageGiHours",
      key: "storageGiHours",
      width: 110,
      render: (_, row) => hours(row.storageGiHours),
    },
    {
      title: "端口费用",
      dataIndex: "portCost",
      key: "portCost",
      width: 100,
      render: (_, row) => yuan(row.portCost),
    },
    {
      title: "端口·时",
      dataIndex: "portHours",
      key: "portHours",
      width: 90,
      render: (_, row) => hours(row.portHours),
    },
  ];
}
