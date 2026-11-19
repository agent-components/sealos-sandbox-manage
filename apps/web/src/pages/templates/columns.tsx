import { useEffect, useState } from "react";
import { CodeSandboxOutlined, MoreOutlined, UserOutlined } from "@ant-design/icons";
import { App, Button, Col, Dropdown, Empty, Flex, Pagination, Row, Tag, Tooltip, Typography } from "antd";
import {
  useListPageContext,
  type ListPageContextValue,
} from "listpage-components/ListPage";
import { listPagination } from "@/components/list-page";
import { trpc } from '@/api/trpc';
import type { CreateTemplateBody } from '@/modules/api/types';
import { memoryLabel } from "@/lib/sealos/resources";
import type { Template } from "@/lib/template/schema";

export type TemplateFilters = { q?: string; visibility?: "public" | "private" };

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
    icon: record.icon ?? null,
    isPublic: false,
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
      await trpc.templates.create.mutate(templateCopyBody(record) as Parameters<
        typeof trpc.templates.create.mutate
      >[0]);
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
          ...(record.isPublic
            ? []
            : [{ key: "publish", label: "公开" }]),
          { key: "delete", danger: true, label: "删除" },
        ],
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation();
          if (key === "copy") void copyTemplate();
          if (key === "publish") {
            modal.confirm({
              title: "公开模板？",
              content:
                "会复制一份新的公共模板，全员可用。当前模板仍保持私有，之后两边互不影响，公开后不能改回私有。",
              okText: "公开",
              cancelText: "取消",
              onOk: async () => {
                await trpc.templates.publish.mutate({ id: record.id });
                message.success("已公开一份新模板");
                ctx.refreshTable();
              },
            });
          }
          if (key === "delete") {
            modal.confirm({
              title: "删除模板",
              content: `确认删除模板「${record.name}」（${record.id}）？`,
              okText: "删除",
              okButtonProps: { danger: true },
              cancelText: "取消",
              onOk: async () => {
                await trpc.templates.delete.mutate({ id: record.id });
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

const avatarColors = ["#1677ff", "#13c2c2", "#722ed1", "#eb2f96", "#fa8c16", "#52c41a"];

function avatarColor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash + char.charCodeAt(0)) % avatarColors.length;
  return avatarColors[hash] ?? avatarColors[0];
}

function TemplateCard({
  record,
  ctx,
  username,
}: {
  record: Template;
  ctx: ListPageContextValue<Template, TemplateFilters>;
  username: string;
}) {
  const summary = record.description?.trim() || "";
  const mine = record.owner === username;
  return (
    <div
      role={mine ? "button" : undefined}
      tabIndex={mine ? 0 : undefined}
      onClick={() => {
        if (mine) ctx.showFloat("editor", record);
      }}
      onKeyDown={(event) => {
        if (mine && event.key === "Enter") ctx.showFloat("editor", record);
      }}
      className="template-card"
      style={mine ? undefined : { cursor: "default" }}
    >
      <Flex align="flex-start" gap={12}>
        {record.icon ? (
          <img
            src={record.icon}
            alt=""
            width={44}
            height={44}
            style={{ flex: "none", width: 44, height: 44, borderRadius: 12, objectFit: "cover" }}
          />
        ) : (
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
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <Flex align="flex-start" justify="space-between" gap={8}>
            <div style={{ minWidth: 0 }}>
              <Typography.Text strong ellipsis={{ tooltip: record.name }} style={{ fontSize: 16 }}>
                {record.name}
              </Typography.Text>
              <Typography.Text
                type="secondary"
                ellipsis={{ tooltip: record.image }}
                style={{ display: "block", fontSize: 12 }}
              >
                {record.image}
              </Typography.Text>
            </div>
            {mine ? (
              <span onClick={(event) => event.stopPropagation()}>
                <TemplateActions record={record} ctx={ctx} />
              </span>
            ) : null}
          </Flex>
          <Flex gap={6} wrap style={{ marginTop: 6 }}>
            {record.isPublic ? (
              <Tag color="blue" style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                公共
              </Tag>
            ) : null}
            <Tag style={{ marginInlineEnd: 0, borderRadius: 999 }}>CPU {record.cpu} 核</Tag>
            <Tag style={{ marginInlineEnd: 0, borderRadius: 999 }}>
              内存 {memoryLabel(record.memoryGi)}
            </Tag>
          </Flex>
        </div>
      </Flex>
      <div style={{ minHeight: 44 }}>
        {summary ? (
          <Typography.Paragraph
            type="secondary"
            ellipsis={{ rows: 2, tooltip: summary }}
            style={{ margin: 0 }}
          >
            {summary}
          </Typography.Paragraph>
        ) : (
          <Typography.Text type="secondary">暂无描述</Typography.Text>
        )}
      </div>
      <Flex align="center" gap={16} style={{ marginTop: "auto" }}>
        <Tooltip title="引用的沙箱">
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            <CodeSandboxOutlined style={{ marginRight: 6 }} />
            {record.sandboxCount ?? 0}
          </Typography.Text>
        </Tooltip>
        <Tooltip title="创建人">
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            <UserOutlined style={{ marginRight: 6 }} />
            {record.ownerName || record.owner || "—"}
          </Typography.Text>
        </Tooltip>
      </Flex>
    </div>
  );
}

export function TemplateCardList() {
  const ctx = useListPageContext<Template, TemplateFilters>();
  const [username, setUsername] = useState("");
  useEffect(() => {
    void trpc.auth.me.query().then((res) => {
      if (res.username) setUsername(res.username);
    });
  }, []);
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
              <TemplateCard record={record} ctx={ctx} username={username} />
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
