"use client";

import { useState } from "react";
import { App, Button, Flex, Space, Tag, Tooltip, Typography } from "antd";
import type {
  ListPageColumnType,
  ListPageContextValue,
} from "listpage-components/ListPage";
import { sandboxClient, type CreateTemplateBody } from "@/lib/client";
import { memoryLabel } from "@/lib/sealos/resources";
import type { Template } from "@/lib/template/schema";

export type TemplateFilters = { q?: string };

/** 用列表里已有的模板数据组创建请求，不传 ID，由服务端生成新 ID。 */
function templateCopyBody(record: Template): CreateTemplateBody {
  return {
    name: record.name,
    description: record.description,
    image: record.image,
    imageRegistry: record.imageRegistry ?? null,
    launchCommand: record.launchCommand,
    cpu: record.cpu,
    memoryGi: record.memoryGi,
    replicas: record.replicas,
    autoShutdown: record.autoShutdown,
    idleMinutes: record.idleMinutes,
    ports: record.ports,
    env: record.env ?? [],
    storage: record.storage ?? [],
    configMap: record.configMap ?? [],
  };
}

function TemplateActions({
  record,
  ctx,
}: {
  record: Template;
  ctx: ListPageContextValue<Template, TemplateFilters>;
}) {
  const { message, modal } = App.useApp();
  const [copying, setCopying] = useState(false);

  async function copyTemplate() {
    setCopying(true);
    try {
      await sandboxClient.createTemplate(templateCopyBody(record));
      message.success(`已复制模板「${record.name}」`);
      ctx.refreshTable();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "复制失败");
    } finally {
      setCopying(false);
    }
  }

  return (
    <Space size={0}>
      <Button
        type="link"
        size="small"
        style={{ paddingInline: 4 }}
        onClick={() => ctx.showFloat("editor", record)}
      >
        编辑
      </Button>
      <Button
        type="link"
        size="small"
        style={{ paddingInline: 4 }}
        loading={copying}
        onClick={() => void copyTemplate()}
      >
        复制
      </Button>
      <Button
        type="link"
        size="small"
        danger
        style={{ paddingInline: 4 }}
        onClick={() =>
          modal.confirm({
            title: "删除模板",
            content: `确认删除模板「${record.name}」（${record.id}）？`,
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
              await sandboxClient.deleteTemplate(record.id);
              message.success("已删除");
              ctx.refreshTable();
            },
          })
        }
      >
        删除
      </Button>
    </Space>
  );
}

export function templateColumns(): ListPageColumnType<Template, TemplateFilters>[] {
  return [
    {
      title: "ID",
      dataIndex: "id",
      width: 180,
      fixed: "left",
      render: (id: string) => (
        <Typography.Text style={{ fontFamily: "var(--font-mono)" }}>
          {id}
        </Typography.Text>
      ),
    },
    { title: "名称", dataIndex: "name", width: 160 },
    {
      title: "镜像",
      dataIndex: "image",
      width: 280,
      render: (image: string) => (
        <Typography.Text
          type="secondary"
          ellipsis={{ tooltip: image }}
          style={{ fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}
        >
          {image}
        </Typography.Text>
      ),
    },
    {
      title: "网络",
      key: "ports",
      width: 180,
      render: (_, tpl) => {
        const ports = tpl.ports ?? [];
        if (!ports.length) return "—";
        const formatPort = (p: (typeof ports)[number]) =>
          `${p.number}/${p.protocol}${p.isPublic ? " · 公网" : ""}`;
        const first = ports[0]!;
        const rest = ports.slice(1);
        return (
          <Flex align="center" gap={6} wrap={false}>
            <Typography.Text style={{ fontSize: 13 }} ellipsis>
              {formatPort(first)}
            </Typography.Text>
            {rest.length > 0 ? (
              <Tooltip
                title={
                  <div style={{ whiteSpace: "pre-line" }}>
                    {rest.map(formatPort).join("\n")}
                  </div>
                }
              >
                <Tag style={{ marginInlineEnd: 0, cursor: "default" }}>
                  +{rest.length}
                </Tag>
              </Tooltip>
            ) : null}
          </Flex>
        );
      },
    },
    {
      title: "资源",
      key: "spec",
      width: 160,
      render: (_, tpl) => (
        <Typography.Text type="secondary">
          {tpl.cpu} 核 · {memoryLabel(tpl.memoryGi)}
          {tpl.replicas > 1 ? ` · ×${tpl.replicas}` : ""}
        </Typography.Text>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      align: "right",
      fixed: "right",
      component: ({ record, ctx }) => (
        <TemplateActions record={record} ctx={ctx} />
      ),
    },
  ];
}
