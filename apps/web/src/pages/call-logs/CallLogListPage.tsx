import { useMemo } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { ListPage } from 'listpage-components';
import { createCallLogColumns } from './config/columns';
import { callLogFilters } from './config/filters';
import { createCallLogFloats } from './config/floats';
import { callLogRequest } from './config/request';
import type { CallLogFilters, CallLogRow } from './types';

export function CallLogListPage() {
  const columns = useMemo(() => createCallLogColumns(), []);
  const floats = useMemo(() => createCallLogFloats(), []);

  return (
    <ListPage<CallLogRow, CallLogFilters>
      title="调用日志"
      extra={(ctx) => (
        <Button icon={<ReloadOutlined />} onClick={() => ctx.refreshTable()}>
          刷新
        </Button>
      )}
      filter={callLogFilters}
      table={{
        columns,
        rowKey: 'id',
        scroll: { x: 1000, y: 'calc(100vh - 420px)' },
        pagination: {
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
        },
      }}
      request={callLogRequest}
      float={{ floats }}
      initialValues={{ pageSize: 20 }}
    />
  );
}