"use client";

import { useCallback, useMemo } from "react";
import { App, Button, Typography } from "antd";
import {
  ListPage,
  useListPageContext,
  type FloatComponentProps,
} from "listpage-components/ListPage";
import { listPagination } from "@/components/list-page";
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
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            模板管理
          </Typography.Title>
          <Typography.Text type="secondary">
            对齐 Sealos 应用管理参数；沙箱必须基于模板创建
          </Typography.Text>
        </div>
      }
      extra={(ctx) => (
        <Button type="primary" onClick={() => ctx.showFloat("editor")}>
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
        rowKey: "id",
        columns,
        density: "compact",
        title: "模板列表",
        columnResize: { persistenceKey: "sandbox-templates-width" },
        columnSetting: { persistenceKey: "sandbox-templates-columns" },
        extra: (_ctx, columnSetting) => columnSetting?.trigger ?? null,
        scroll: { x: 1070 },
        pagination: listPagination,
      }}
      request={request}
      float={{ floats }}
      initialValues={{ pageSize: 20 }}
    />
  );
}
