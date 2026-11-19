import type { FloatItem, FloatComponentProps } from 'listpage-components';
import type { Template } from '@/modules/template/schema';
import { TemplateEditor } from '../components/TemplateEditor';

export const templateEditorFloatKey = 'editor';

function TemplateEditorFloat({ record, onClose }: FloatComponentProps<Template>) {
  return (
    <TemplateEditor
      open
      template={record}
      onClose={() => onClose()}
      onSaved={() => onClose(true)}
    />
  );
}

export function createTemplateFloats(): FloatItem<Template>[] {
  return [
    {
      key: templateEditorFloatKey,
      render: (props) => <TemplateEditorFloat {...props} />,
    },
  ];
}