import { useMemo } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { ListPage } from 'listpage-components';
import { AutoRefreshList } from '@/components/list-page';
import type { Sandbox } from '@/modules/sandbox/schema';
import { OpenInitialView } from './components/OpenInitialView';
import { SandboxTable } from './components/SandboxTable';
import { sandboxFilters, type SandboxFilters } from './config/filters';
import { createSandboxFloats } from './config/floats';
import { sandboxRequest } from './config/request';

export function SandboxListPage({
  initialViewSandboxId = null,
  onConsumedInitialView,
  onNavigateTemplates,
}: {
  initialViewSandboxId?: string | null;
  onConsumedInitialView?: () => void;
  onNavigateTemplates?: () => void;
}) {
  const floats = useMemo(
    () => createSandboxFloats({ onNavigateTemplates }),
    [onNavigateTemplates],
  );

  return (
    <ListPage<Sandbox, SandboxFilters>
      title="沙箱列表"
      extra={(ctx) => (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => ctx.showFloat('create')}
        >
          新建沙箱
        </Button>
      )}
      filter={sandboxFilters}
      middle={
        <>
          <OpenInitialView
            sandboxId={initialViewSandboxId}
            onConsumed={onConsumedInitialView}
          />
          <AutoRefreshList intervalMs={5000} />
        </>
      }
      table={{ render: () => <SandboxTable /> }}
      request={sandboxRequest}
      float={{ floats }}
      initialValues={{ pageSize: 20 }}
    />
  );
}