"use client";

import { useCallback, useMemo } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Select, Typography } from "antd";
import {
  ListPage,
  useListPageContext,
  type FloatComponentProps,
} from "listpage-components/ListPage";
import { sandboxClient } from "@/lib/client";
import type { Template } from "@/lib/template/schema";
import { TemplateCardList, type TemplateFilters } from "./columns";
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
          ...(filters.visibility === "public"
            ? { isPublic: true }
            : filters.visibility === "private"
              ? { isPublic: false }
              : {}),
        });
        return { list: res.list, total: res.total };
      } catch (err) {
        message.error(err instanceof Error ? err.message : "加载失败");
        return { list: [], total: 0 };
      }
    },
    [message],
  );

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
          {
            name: "visibility",
            label: "可见范围",
            component: (
              <Select
                allowClear
                placeholder="全部"
                options={[
                  { value: "public", label: "公开" },
                  { value: "private", label: "私有" },
                ]}
              />
            ),
          },
        ],
      }}
      table={{ render: () => <TemplateCardList /> }}
      request={request}
      float={{ floats }}
      initialValues={{ pageSize: 20 }}
    />
  );
}
