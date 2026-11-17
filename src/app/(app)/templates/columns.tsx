"use client";

import { useState } from "react";
import { MoreOutlined } from "@ant-design/icons";
import { App, Button, Col, Dropdown, Empty, Flex, Pagination, Row, Tag, Typography } from "antd";
import {
  useListPageContext,
  type ListPageContextValue,
} from "listpage-components/ListPage";
import { listPagination } from "@/components/list-page";
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
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      menu={{
        items: [
          { key: "copy", label: "复制", disabled: copying },
          { key: "delete", danger: true, label: "删除" },
        ],
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation();
          if (key === "copy") void copyTemplate();
          if (key === "delete") {
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
            });
          }
        },
      }}
    >
      <Button
        type="link"
        size="small"
        icon={<MoreOutlined />}
        aria-label="更多"
        onClick={(event) => event.stopPropagation()}
      />
    </Dropdown>
  );
}

function formatPort(port: Template["ports"][number]) {
  return `${port.number}/${port.protocol}${port.isPublic ? " · 公网" : ""}`;
}

const avatarColors = ["#1677ff", "#13c2c2", "#722ed1", "#eb2f96", "#fa8c16", "#52c41a"];

function avatarColor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash + char.charCodeAt(0)) % avatarColors.length;
  return avatarColors[hash] ?? avatarColors[0];
}

function TemplateCard({
  record,
  ctx,
}: {
  record: Template;
  ctx: ListPageContextValue<Template, TemplateFilters>;
}) {
  const ports = record.ports ?? [];
  const summary = record.description?.trim() || record.image;
  const portText = ports.map(formatPort).join("，");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => ctx.showFloat("editor", record)}
      onKeyDown={(event) => {
        if (event.key === "Enter") ctx.showFloat("editor", record);
      }}
      className="template-card"
    >
      <Flex align="flex-start" gap={12}>
        <span
          aria-hidden
          style={{
            flex: "none",
            width: 44,
            height: 44,
            borderRadius: 12,
            background: avatarColor(record.name),
            color: "#fff",
            fontWeight: 600,
            fontSize: 18,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {record.name.trim().slice(0, 1) || "模"}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Flex align="flex-start" justify="space-between" gap={8}>
            <Typography.Text strong ellipsis={{ tooltip: record.name }} style={{ fontSize: 16 }}>
              {record.name}
            </Typography.Text>
            <span onClick={(event) => event.stopPropagation()}>
              <TemplateActions record={record} ctx={ctx} />
            </span>
          </Flex>
          <Flex gap={6} wrap style={{ marginTop: 6 }}>
            <Tag style={{ marginInlineEnd: 0, borderRadius: 999 }}>CPU {record.cpu} 核</Tag>
            <Tag style={{ marginInlineEnd: 0, borderRadius: 999 }}>
              内存 {memoryLabel(record.memoryGi)}
            </Tag>
          </Flex>
        </div>
      </Flex>
      <div style={{ minHeight: 44 }}>
        <Typography.Paragraph
          type="secondary"
          ellipsis={{ rows: 2, tooltip: summary }}
          style={{ margin: 0 }}
        >
          {summary}
        </Typography.Paragraph>
        {portText ? (
          <Typography.Paragraph
            type="secondary"
            ellipsis={{ rows: 1, tooltip: portText }}
            style={{ margin: "4px 0 0" }}
          >
            {portText}
          </Typography.Paragraph>
        ) : null}
      </div>
    </div>
  );
}

export function TemplateCardList() {
  const ctx = useListPageContext<Template, TemplateFilters>();
  const filtering = Boolean(ctx.filters.q?.trim());
  return (
    <div>
      {ctx.dataSource.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            ctx.loading ? "加载中…" : filtering ? "没有匹配的模板" : "还没有模板"
          }
        />
      ) : (
        <Row gutter={[16, 16]}>
          {ctx.dataSource.map((record) => (
            <Col key={record.id} xs={24} md={12} xl={8} style={{ minWidth: 0 }}>
              <TemplateCard record={record} ctx={ctx} />
            </Col>
          ))}
        </Row>
      )}
      <Flex justify="flex-end" style={{ marginTop: 16 }}>
        <Pagination
          current={ctx.pagination.current}
          pageSize={ctx.pagination.pageSize}
          total={ctx.pagination.total}
          {...listPagination}
          onChange={ctx.updatePagination}
        />
      </Flex>
    </div>
  );
}
