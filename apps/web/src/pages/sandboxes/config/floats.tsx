import type { FloatItem, FloatComponentProps } from 'listpage-components';
import { SandboxDesktopModal } from '../components/SandboxDesktopModal';
import { SandboxDetailModal } from '../components/SandboxDetailModal';
import { SandboxDiskUsageModal } from '../components/SandboxDiskUsageModal';
import { SandboxLogsModal } from '../components/SandboxLogsModal';
import type { Sandbox } from '@/modules/sandbox/schema';
import { CreateSandboxModal } from '../components/CreateSandboxModal';
import { DeleteSandboxModal } from '../components/DeleteSandboxModal';

type SandboxFloatOptions = {
  onNavigateTemplates?: () => void;
};

function CreateSandboxFloat({
  onClose,
  onNavigateTemplates,
}: FloatComponentProps<Sandbox> & { onNavigateTemplates?: () => void }) {
  return (
    <CreateSandboxModal
      open
      onClose={() => onClose()}
      onSaved={() => onClose(true)}
      onNavigateTemplates={onNavigateTemplates}
    />
  );
}

function DetailFloat({ record, onClose }: FloatComponentProps<Sandbox>) {
  return (
    <SandboxDetailModal
      sandboxId={record?.id ?? ''}
      open
      onClose={() => onClose()}
      onChanged={() => onClose(true)}
    />
  );
}

function LogsFloat({ record, onClose }: FloatComponentProps<Sandbox>) {
  return (
    <SandboxLogsModal
      sandboxId={record?.id ?? ''}
      open
      onClose={() => onClose()}
    />
  );
}

function DesktopFloat({ record, onClose }: FloatComponentProps<Sandbox>) {
  return (
    <SandboxDesktopModal
      sandboxId={record?.id ?? ''}
      open
      onClose={() => onClose()}
    />
  );
}

function DiskFloat({ record, onClose }: FloatComponentProps<Sandbox>) {
  return (
    <SandboxDiskUsageModal
      sandboxId={record?.id ?? ''}
      open
      onClose={() => onClose()}
    />
  );
}

function DeleteFloat({ record, onClose }: FloatComponentProps<Sandbox>) {
  return (
    <DeleteSandboxModal
      sandbox={record ?? null}
      open
      onClose={() => onClose()}
      onSaved={() => onClose(true)}
    />
  );
}

export function createSandboxFloats(
  options: SandboxFloatOptions,
): FloatItem<Sandbox>[] {
  return [
    {
      key: 'create',
      render: (props) => (
        <CreateSandboxFloat
          {...props}
          onNavigateTemplates={options.onNavigateTemplates}
        />
      ),
    },
    {
      key: 'detail',
      render: (props) => <DetailFloat {...props} />,
    },
    {
      key: 'logs',
      render: (props) => <LogsFloat {...props} />,
    },
    {
      key: 'desktop',
      render: (props) => <DesktopFloat {...props} />,
    },
    {
      key: 'disk',
      render: (props) => <DiskFloat {...props} />,
    },
    {
      key: 'delete',
      render: (props) => <DeleteFloat {...props} />,
    },
  ];
}