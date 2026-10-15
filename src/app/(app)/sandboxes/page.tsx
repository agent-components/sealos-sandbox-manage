"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  App,
  Button,
  Collapse,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined } from "@ant-design/icons";
import { IdleShutdownConfig } from "@/components/IdleShutdownConfig";
import { ResourceConfig } from "@/components/ResourceConfig";
import { SandboxDetailModal } from "@/components/SandboxDetailModal";
import { SandboxLogsModal } from "@/components/SandboxLogsModal";
import { StateBadge } from "@/components/StateBadge";
import { boatClient } from "@/lib/client";
import { TagsSchema, type Sandbox } from "@/lib/sandbox/schema";
import {
  DEFAULT_RESOURCES,
  memoryLabel,
  type ResourceSpec,
} from "@/lib/sealos/resources";
import type { Template } from "@/lib/template/schema";
import { primaryDiskGi } from "@/lib/template/schema";

function canStop(state: Sandbox["state"]) {
  return state === "running" || state === "starting";
}

function canStart(state: Sandbox["state"]) {
  return state === "stopped" || state === "error";
}

export default function SandboxesPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [resources, setResources] =
    useState<ResourceSpec>(DEFAULT_RESOURCES);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createTags, setCreateTags] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [createEnv, setCreateEnv] = useState<{ name: string; value: string }[]>(
    [],
  );
  const [createIdle, setCreateIdle] = useState({
    autoShutdown: false,
    idleMinutes: 5,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [logsId, setLogsId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sandbox | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const view = searchParams.get("view");
    if (view) {
      setViewId(view);
      router.replace("/sandboxes");
    }
  }, [router, searchParams]);

  const refresh = useCallback(async () => {
    try {
      const res = await boatClient.listSandboxes();
      setSandboxes(res.sandboxes);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await boatClient.listTemplates();
      setTemplates(res.templates);
      return res.templates;
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载模板失败");
      return [] as Template[];
    }
  }, [message]);

  useEffect(() => {
    void refresh();
    void loadTemplates();
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh, loadTemplates]);

  async function openCreate() {
    const list = await loadTemplates();
    if (list.length === 0) {
      message.warning("请先创建模板，再创建沙箱");
      router.push("/templates");
      return;
    }
    const first = list[0]!;
    setTemplateId(first.id);
    setResources({
      cpu: first.cpu,
      memoryGi: first.memoryGi,
      diskGi: primaryDiskGi(first.storage),
    });
    setCreateEnv(
      (first.env ?? [])
        .filter((e) => e.name.trim())
        .map((e) => ({ name: e.name, value: e.value ?? "" })),
    );
    setCreateIdle({
      autoShutdown: first.autoShutdown ?? false,
      idleMinutes: first.idleMinutes ?? 5,
    });
    setCreateName("");
    setCreateTags([]);
    setAdvancedOpen(false);
    setCreateOpen(true);
  }

  function onSelectTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      setResources({
        cpu: tpl.cpu,
        memoryGi: tpl.memoryGi,
        diskGi: primaryDiskGi(tpl.storage),
      });
      setCreateEnv(
        (tpl.env ?? [])
          .filter((e) => e.name.trim())
          .map((e) => ({ name: e.name, value: e.value ?? "" })),
      );
      setCreateIdle({
        autoShutdown: tpl.autoShutdown ?? false,
        idleMinutes: tpl.idleMinutes ?? 5,
      });
    }
  }

  async function create() {
    if (!templateId) {
      message.error("请选择模板");
      return;
    }
    const name = createName.trim();
    if (name) {
      if (
        name.length > 48 ||
        !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)
      ) {
        message.error(
          "ID 只能包含小写字母、数字和连字符，长度 1–48，且首尾为字母或数字",
        );
        return;
      }
    }
    const parsedTags = TagsSchema.safeParse(createTags);
    if (!parsedTags.success) {
      message.error(parsedTags.error.issues[0]?.message ?? "标签无效");
      return;
    }
    setCreating(true);
    try {
      await boatClient.createSandbox({
        templateId,
        cpu: resources.cpu,
        memoryGi: resources.memoryGi,
        diskGi: resources.diskGi,
        env: createEnv.filter((e) => e.name.trim()),
        tags: parsedTags.data,
        autoShutdown: createIdle.autoShutdown,
        idleMinutes: createIdle.idleMinutes,
        ...(name ? { name } : {}),
      });
      setCreateOpen(false);
      message.success("沙箱已创建");
      await refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function runPower(sb: Sandbox) {
    setBusyId(sb.id);
    try {
      if (canStop(sb.state)) {
        await boatClient.stopSandbox(sb.id);
        message.success("已关机");
      } else {
        await boatClient.resumeSandbox(sb.id);
        message.success("已开机");
      }
      await refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteConfirm.trim() !== deleteTarget.id) {
      message.error("输入的 ID 与沙箱 ID 不一致");
      return;
    }
    setDeleting(true);
    try {
      await boatClient.deleteSandbox(deleteTarget.id);
      message.success("已删除");
      setDeleteTarget(null);
      setDeleteConfirm("");
      await refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  const visibleSandboxes = useMemo(() => {
    const terms = tagQuery
      .split(/[\s,]+/)
      .map((term) => term.trim().toLocaleLowerCase())
      .filter(Boolean);
    if (terms.length === 0) return sandboxes;
    return sandboxes.filter((sandbox) =>
      terms.every((term) =>
        sandbox.tags.some((tag) => tag.toLocaleLowerCase().includes(term)),
      ),
    );
  }, [sandboxes, tagQuery]);

  const templateNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of templates) map.set(t.id, t.name);
    return map;
  }, [templates]);

  const columns: ColumnsType<Sandbox> = useMemo(
    () => [
      {
        title: "名称",
        dataIndex: "id",
        key: "id",
        width: 160,
        fixed: "left",
        render: (id: string) => (
          <Typography.Text
            strong
            style={{ fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}
          >
            {id}
          </Typography.Text>
        ),
      },
      {
        title: "模板",
        dataIndex: "templateId",
        key: "templateId",
        width: 180,
        render: (id?: string) => {
          if (!id) return "—";
          const name = templateNameById.get(id);
          return (
            <Typography.Text type="secondary" style={{ whiteSpace: "nowrap" }}>
              {name || id}
            </Typography.Text>
          );
        },
      },
      {
        title: "镜像",
        dataIndex: "image",
        key: "image",
        width: 280,
        render: (image?: string) =>
          image ? (
            <Typography.Text
              type="secondary"
              style={{ fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}
            >
              {image}
            </Typography.Text>
          ) : (
            "—"
          ),
      },
      {
        title: "规格",
        key: "spec",
        width: 140,
        render: (_, sb) => (
          <Typography.Text
            type="secondary"
            style={{ whiteSpace: "nowrap" }}
          >
            {sb.cpu} 核 · {memoryLabel(sb.memoryGi)}
          </Typography.Text>
        ),
      },
      {
        title: "标签",
        dataIndex: "tags",
        key: "tags",
        width: 220,
        render: (tags: string[]) =>
          tags.length > 0 ? (
            <Space size={4} wrap>
              {tags.map((tag) => (
                <Tag
                  key={tag}
                  style={{ marginInlineEnd: 0, cursor: "pointer" }}
                  onClick={() => setTagQuery(tag)}
                >
                  {tag}
                </Tag>
              ))}
            </Space>
          ) : (
            "—"
          ),
      },
      {
        title: "状态",
        dataIndex: "state",
        key: "state",
        width: 100,
        render: (state: Sandbox["state"]) => <StateBadge state={state} />,
      },
      {
        title: "操作",
        key: "actions",
        width: 160,
        align: "right",
        fixed: "right",
        render: (_, sb) => {
          const rowBusy = busyId === sb.id;
          const powerLabel = canStop(sb.state) ? "关机" : "开机";
          const powerDisabled =
            rowBusy ||
            deleting ||
            (!canStop(sb.state) && !canStart(sb.state));

          return (
            <Space size={0}>
              <Button
                type="link"
                size="small"
                style={{ paddingInline: 2 }}
                onClick={() => setViewId(sb.id)}
              >
                查看
              </Button>
              <Button
                type="link"
                size="small"
                style={{ paddingInline: 2 }}
                onClick={() => setLogsId(sb.id)}
              >
                日志
              </Button>
              <Button
                type="link"
                size="small"
                style={{ paddingInline: 2 }}
                loading={rowBusy}
                disabled={powerDisabled && !rowBusy}
                onClick={() => void runPower(sb)}
              >
                {powerLabel}
              </Button>
              <Button
                type="link"
                size="small"
                danger
                style={{ paddingInline: 2 }}
                disabled={rowBusy || deleting}
                onClick={() => {
                  setDeleteTarget(sb);
                  setDeleteConfirm("");
                }}
              >
                删除
              </Button>
            </Space>
          );
        },
      },
    ],
    [busyId, deleting, templateNameById],
  );

  return (
    <>
      <Flex
        align="flex-start"
        justify="space-between"
        gap={16}
        wrap
        style={{ marginBottom: 24 }}
      >
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            沙箱
          </Typography.Title>
          <Typography.Text type="secondary">
            基于模板创建 · 状态每 5 秒刷新
          </Typography.Text>
        </div>
        <Space wrap>
          <Input
            allowClear
            placeholder="按标签检索"
            value={tagQuery}
            onChange={(e) => setTagQuery(e.target.value)}
            style={{ width: 220 }}
          />
          <Button type="primary" onClick={() => void openCreate()}>
            新建沙箱
          </Button>
        </Space>
      </Flex>

      <div className="boat-table-wrap">
        <Table<Sandbox>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={visibleSandboxes}
          pagination={false}
          showSorterTooltip={false}
          scroll={{ x: 1280 }}
          locale={{
            emptyText:
              sandboxes.length > 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="没有匹配的标签"
                />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="还没有沙箱"
                >
                  <Button type="primary" onClick={() => void openCreate()}>
                    新建沙箱
                  </Button>
                </Empty>
              ),
          }}
        />
      </div>

      <Modal
        title="新建沙箱"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        centered
        destroyOnHidden
        width={560}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
        okButtonProps={{ disabled: !templateId }}
        onOk={() => void create()}
      >
        <Form
          layout="horizontal"
          disabled={creating}
          labelCol={{ flex: "88px" }}
          wrapperCol={{ flex: 1 }}
          labelAlign="right"
          colon={false}
        >
          <Form.Item label="模板" required>
            <Select
              value={templateId}
              placeholder="请选择模板"
              options={templates.map((t) => ({
                value: t.id,
                label: `${t.name}（${t.id}）`,
              }))}
              onChange={onSelectTemplate}
            />
          </Form.Item>
          <Form.Item label="沙箱 ID">
            <Input
              value={createName}
              placeholder="留空则自动生成"
              maxLength={48}
              onChange={(e) => setCreateName(e.target.value.toLowerCase())}
            />
          </Form.Item>
          <Form.Item label="标签">
            <Select
              mode="tags"
              value={createTags}
              placeholder="输入后回车，可添加多个"
              tokenSeparators={[","]}
              open={false}
              suffixIcon={null}
              onChange={(values: string[]) =>
                setCreateTags(
                  values.map((value) => value.trim()).filter(Boolean),
                )
              }
            />
          </Form.Item>
          <Collapse
            ghost
            size="small"
            activeKey={advancedOpen ? ["advanced"] : []}
            onChange={(keys) => {
              const next = Array.isArray(keys) ? keys : [keys];
              setAdvancedOpen(next.includes("advanced"));
            }}
            items={[
              {
                key: "advanced",
                label: "高级配置",
                children: (
                  <Space
                    direction="vertical"
                    size={20}
                    style={{ width: "100%" }}
                  >
                    <div>
                      <Typography.Text
                        strong
                        style={{ display: "block", marginBottom: 10 }}
                      >
                        环境变量
                      </Typography.Text>
                      <Space
                        direction="vertical"
                        size={8}
                        style={{ width: "100%" }}
                      >
                        {createEnv.map((item, index) => (
                          <Flex key={index} gap={8}>
                            <Input
                              placeholder="KEY"
                              value={item.name}
                              style={{ flex: 1 }}
                              onChange={(e) =>
                                setCreateEnv((list) => {
                                  const next = [...list];
                                  next[index] = {
                                    ...next[index]!,
                                    name: e.target.value,
                                  };
                                  return next;
                                })
                              }
                            />
                            <Input
                              placeholder="VALUE"
                              value={item.value}
                              style={{ flex: 1.4 }}
                              onChange={(e) =>
                                setCreateEnv((list) => {
                                  const next = [...list];
                                  next[index] = {
                                    ...next[index]!,
                                    value: e.target.value,
                                  };
                                  return next;
                                })
                              }
                            />
                            <Button
                              type="link"
                              danger
                              style={{ paddingInline: 0 }}
                              onClick={() =>
                                setCreateEnv((list) =>
                                  list.filter((_, i) => i !== index),
                                )
                              }
                            >
                              删除
                            </Button>
                          </Flex>
                        ))}
                        <Button
                          type="dashed"
                          block
                          icon={<PlusOutlined />}
                          onClick={() =>
                            setCreateEnv((list) => [
                              ...list,
                              { name: "", value: "" },
                            ])
                          }
                        >
                          添加环境变量
                        </Button>
                      </Space>
                    </div>
                    <div>
                      <Typography.Text
                        strong
                        style={{ display: "block", marginBottom: 10 }}
                      >
                        规格
                      </Typography.Text>
                      <ResourceConfig
                        value={resources}
                        onChange={setResources}
                        disabled={creating}
                        showDisk={false}
                      />
                      <div style={{ marginTop: 28 }}>
                        <IdleShutdownConfig
                          value={createIdle}
                          onChange={setCreateIdle}
                          disabled={creating}
                          layout="stack"
                        />
                      </div>
                    </div>
                  </Space>
                ),
              },
            ]}
          />
        </Form>
      </Modal>

      <SandboxDetailModal
        sandboxId={viewId ?? ""}
        open={!!viewId}
        onClose={() => setViewId(null)}
        onChanged={refresh}
      />

      <SandboxLogsModal
        sandboxId={logsId ?? ""}
        open={!!logsId}
        onClose={() => setLogsId(null)}
      />

      <Modal
        title="删除沙箱"
        open={!!deleteTarget}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
            setDeleteConfirm("");
          }
        }}
        centered
        destroyOnHidden
        okText="确认删除"
        okButtonProps={{
          danger: true,
          disabled: !deleteTarget || deleteConfirm.trim() !== deleteTarget.id,
          loading: deleting,
        }}
        cancelButtonProps={{ disabled: deleting }}
        onOk={() => void confirmDelete()}
      >
        <Typography.Paragraph type="secondary">
          此操作不可恢复。请输入沙箱 ID{" "}
          <Typography.Text code>{deleteTarget?.id}</Typography.Text>{" "}
          以确认删除。
        </Typography.Paragraph>
        <Input
          autoFocus
          value={deleteConfirm}
          disabled={deleting}
          placeholder={deleteTarget?.id}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          onPressEnter={() => void confirmDelete()}
        />
      </Modal>

      {templates.length === 0 && !loading ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
          还没有模板时无法创建沙箱，请先去{" "}
          <Link href="/templates">模板</Link> 页面创建。
        </Typography.Paragraph>
      ) : null}
    </>
  );
}
