import { Select } from 'antd';
import type { FilterConfig } from 'listpage-components';

export type TemplateFilters = {
  q?: string;
  visibility?: 'public' | 'private';
};

export const templateFilters: FilterConfig<TemplateFilters> = {
  items: [
    {
      name: 'q',
      label: '关键词',
      placeholder: '名称、ID 或镜像',
    },
    {
      name: 'visibility',
      label: '可见范围',
      component: (
        <Select
          allowClear
          placeholder="全部"
          options={[
            { value: 'public', label: '公开' },
            { value: 'private', label: '私有' },
          ]}
        />
      ),
    },
  ],
};