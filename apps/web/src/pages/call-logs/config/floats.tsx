import type { FloatItem, FloatComponentProps } from 'listpage-components';
import { CallLogDetailDrawer } from '../components/CallLogDetailDrawer';
import type { CallLogRow } from '../types';

export const callLogDetailFloatKey = 'detail';

export function createCallLogFloats(): FloatItem<CallLogRow>[] {
  return [
    {
      key: callLogDetailFloatKey,
      render: ({ record, onClose }: FloatComponentProps<CallLogRow>) => (
        <CallLogDetailDrawer
          logId={record?.id ?? null}
          onClose={() => onClose()}
        />
      ),
    },
  ];
}