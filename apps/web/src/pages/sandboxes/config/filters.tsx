import { useEffect, useState } from 'react';
import { Select } from 'antd';
import type { FilterConfig } from 'listpage-components';
import { sandboxStateOptions } from '../components/StateBadge';
import { trpc } from '@/api/trpc';
import type { Sandbox } from '@/modules/sandbox/schema';

export type SandboxFilters = {
  q?: string;
  tag?: string;
  state?: Sandbox['state'];
  templateId?: string;
};

function TemplateFilterSelect() {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    void trpc.templates.list.query().then((res) => {
      setOptions(
        res.list.map((item) => ({
          value: item.id,
          label: item.name || item.id,
        })),
      );
    });
  }, []);

  return (
    <Select
      allowClear
      showSearch
      optionFilterProp="label"
      placeholder="全部模板"
      options={options}
    />
  );
}

export const sandboxFilters: FilterConfig<SandboxFilters> = {
  items: [
    { name: 'q', label: '关键词', placeholder: '名称、模板镜像或模板名' },
    {
      name: 'tag',
      label: '标签',
      placeholder: '多个标签用空格分隔',
    },
    {
      name: 'state',
      label: '状态',
      component: (
        <Select
          allowClear
          placeholder="全部状态"
          options={sandboxStateOptions}
        />
      ),
    },
    {
      name: 'templateId',
      label: '模板',
      component: <TemplateFilterSelect />,
    },
  ],
};