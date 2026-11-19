import { useMemo } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { ListPage } from 'listpage-components';
import type { Template } from '@/modules/template/schema';
import { TemplateCardList } from './components/TemplateCardList';
import {
  createTemplateFloats,
  templateEditorFloatKey,
} from './config/floats';
import { templateFilters, type TemplateFilters } from './config/filters';
import { templateRequest } from './config/request';

export function TemplateListPage() {
  const floats = useMemo(() => createTemplateFloats(), []);

  return (
    <ListPage<Template, TemplateFilters>
      title="模板管理"
      extra={(ctx) => (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => ctx.showFloat(templateEditorFloatKey)}
        >
          新建模板
        </Button>
      )}
      filter={templateFilters}
      table={{ render: () => <TemplateCardList /> }}
      request={templateRequest}
      float={{ floats }}
      initialValues={{ pageSize: 20 }}
    />
  );
}