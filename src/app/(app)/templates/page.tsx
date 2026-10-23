"use client";

import { useCallback, useMemo } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Typography } from "antd";
import {
  ListPage,
  useListPageContext,
  type FloatComponentProps,
} from "listpage-components/ListPage";
import { HydratedProTable } from "@/components/list-page";
import { sandboxClient } from "@/lib/client";
import type { Template } from "@/lib/template/schema";
import { templateColumns, type TemplateFilters } from "./columns";
import { TemplateEditor } from "./editor";

function TemplateEditorFloat({
  record,
  onClose,
}: FloatComponentProps<Template>) {
  const { refreshTable } = useListPageContext<Template, TemplateFilters>();
  return (
    <TemplateEditor
      open
      template={record}
      onClose={() => onClose()}
      onSaved={refreshTable}
    />
  );
}

export default function TemplatesPage() {
  const { message } = App.useApp();

  const request = useCallback(
    async (
      page: { current: number; pageSize: number },
      filters: TemplateFilters,
    ) => {
      try {
        const res = await sandboxClient.listTemplates({
          current: page.current,
          pageSize: page.pageSize,
          ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
        });
        return { list: res.list, total: res.total };
      } catch (err) {
        message.error(err instanceof Error ? err.message : "加载失败");
        return { list: [], total: 0 };
      }
    },
    [message],
  );

  const columns = useMemo(() => templateColumns(), []);
  const floats = useMemo(
    () => [
      {
        key: "editor",
        render: (props: FloatComponentProps<Template>) => (
          <TemplateEditorFloat {...props} />
        ),
      },
    ],
    [],
  );

  return (
    <ListPage<Template, TemplateFilters>
      title={
        <Typography.Title level={3} style={{ margin: 0 }}>
          模板管理
        </Typography.Title>
      }
      extra={(ctx) => (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => ctx.showFloat("editor")}
        >
          新建模板
        </Button>
      )}
      filter={{
        items: [
          {
            name: "q",
            label: "关键词",
            placeholder: "名称、ID 或镜像",
          },
        ],
      }}
      table={{
        render: () => (
          <HydratedProTable
            columns={columns}
            title="模板列表"
            widthKey="sandbox-templates-width"
            columnKey="sandbox-templates-columns"
            scroll={{ x: 1070 }}
          />
        ),
      }}
      request={request}
      float={{ floats }}
      initialValues={{ pageSize: 20 }}
    />
  );
}
