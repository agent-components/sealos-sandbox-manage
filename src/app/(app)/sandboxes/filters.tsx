"use client";

import { Select } from "antd";
import type { FilterItem } from "listpage-components/ListPage";
import { sandboxStateOptions } from "@/components/StateBadge";
import type { Sandbox } from "@/lib/sandbox/schema";
import type { Template } from "@/lib/template/schema";

export type SandboxFilters = {
  q?: string;
  tag?: string;
  state?: Sandbox["state"];
  templateId?: string;
};

export function sandboxFilters(templates: Template[]): FilterItem<SandboxFilters>[] {
  return [
    { name: "q", label: "关键词", placeholder: "名称、模板镜像或模板名" },
    {
      name: "tag",
      label: "标签",
      placeholder: "多个标签用空格分隔",
    },
    {
      name: "state",
      label: "状态",
      component: (
        <Select
          allowClear
          placeholder="全部状态"
          options={sandboxStateOptions}
        />
      ),
    },
    {
      name: "templateId",
      label: "模板",
      component: (
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="全部模板"
          options={templates.map((item) => ({
            value: item.id,
            label: item.name || item.id,
          }))}
        />
      ),
    },
  ];
}
