import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import type { FilterConfig } from 'listpage-components';
import type { CallLogFilters } from '../types';

export const callLogFilters: FilterConfig<CallLogFilters> = {
  items: [
    {
      name: 'range',
      label: '开始时间',
      colSpan: 4 as const,
      component: (
        <DatePicker.RangePicker
          showTime
          style={{ width: '100%' }}
          placeholder={['开始时间起', '开始时间止']}
          presets={[
            {
              label: '近 1 小时',
              value: [dayjs().subtract(1, 'hour'), dayjs()],
            },
            {
              label: '近 24 小时',
              value: [dayjs().subtract(24, 'hour'), dayjs()],
            },
            {
              label: '近 7 天',
              value: [dayjs().subtract(7, 'day'), dayjs()],
            },
          ]}
        />
      ),
    },
  ],
};