"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Input,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { ProDrawer } from "listpage-components/ProDrawer";
import { IdleShutdownConfig } from "@/components/IdleShutdownConfig";
import { ResourceConfig } from "@/components/ResourceConfig";
import { StateBadge } from "@/components/StateBadge";
import { sandboxClient } from "@/lib/client";
import {
  CreateSandboxEnvSchema,
  TagsSchema,
  type Sandbox,
  type SandboxEnv,
} from "@/lib/sandbox/schema";
import { mergeEnvWithTemplate } from "@/lib/sandbox/sync-from-template";
import { memoryLabel, type ResourceSpec } from "@/lib/sealos/resources";
import type { Template } from "@/lib/template/schema";
import { z } from "zod";

type TemplateDraft = {
  image?: string;
  imageRegistry: Sandbox["imageRegistry"];
  launchCommand?: Sandbox["launchCommand"];
  ports: Sandbox["ports"];
  storage: Sandbox["storage"];
  configMap: Sandbox["configMap"];
};

function draftFromTemplate(
  template: Template,
  diskGi: number,
): TemplateDraft {
  const storage =
    (template.storage ?? []).length > 0
      ? template.storage.map((item, index) =>
        index === 0 ? { ...item, size: `${diskGi}Gi` } : item,
      )
      : [];
  return {
    image: template.image,
    imageRegistry: template.imageRegistry
      ? {
        username: template.imageRegistry.username,
        serverAddress: template.imageRegistry.serverAddress,
        hasPassword: Boolean(template.imageRegistry.password),
      }
      : null,
    launchCommand: template.launchCommand,
    ports: (template.ports ?? []).map((port) => ({
      number: port.number,
      protocol: port.protocol,
      isPublic: port.isPublic,
      publicAddress: null,
      privateAddress: null,
    })),
    storage,
    configMap: (template.configMap ?? []).map((item) => ({
      path: item.path,
      value: item.value ?? "",
    })),
  };
}

function sameTags(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every(
    (tag, index) =>
      tag.toLocaleLowerCase() === right[index]?.toLocaleLowerCase(),
  );
}

function normalizeEnv(list: SandboxEnv[]) {
  return list
    .map((item) => ({
      name: item.name.trim(),
      value: item.value ?? "",
    }))
    .filter((item) => item.name);
}

function sameEnv(left: SandboxEnv[], right: SandboxEnv[]) {
  const a = normalizeEnv(left);
  const b = normalizeEnv(right);
  if (a.length !== b.length) return false;
  return a.every(
    (item, index) =>
      item.name === b[index]?.name && item.value === b[index]?.value,
  );
}

function focusDetailTab(key: string) {
  document
    .querySelector<HTMLElement>(
      `.pro-drawer-tabs .ant-tabs-tab[data-node-key="${key}"]`,
    )
    ?.click();
}

function AddressCell({
  value,
  href,
  empty,
}: {
  value: string | null;
  href?: boolean;
  empty: string;
}) {
  if (!value) return <Typography.Text type="secondary">{empty}</Typography.Text>;
  const textStyle = { wordBreak: "break-all" as const };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "flex-start",
        gap: 4,
        maxWidth: "100%",
      }}
    >
      {href ? (
        <Typography.Link
          href={value.startsWith("http") ? value : `https://${value}`}
          target="_blank"
          style={textStyle}
        >
          {value}
        </Typography.Link>
      ) : (
        <span style={textStyle}>{value}</span>
      )}
      <Typography.Text copyable={{ text: value, tooltips: ["复制", "已复制"] }} />
    </span>
  );
}

function MonoText({ children }: { children: ReactNode }) {
  return (
    <Typography.Text
      style={{
        fontFamily: "var(--font-mono)",
        wordBreak: "break-all",
      }}
    >
      {children}
    </Typography.Text>
  );
}

function InfoField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          marginBottom: 6,
          fontSize: 12,
          lineHeight: "18px",
          color: "var(--ant-color-text-secondary)",
        }}
      >
        {label}
      </div>
      <div style={{ minWidth: 0, lineHeight: "22px" }}>{children}</div>
    </div>
  );
}

function DetailPane({
  error,
  children,
}: {
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div style={{ padding: "16px 20px 24px" }}>
      {error ? (
        <Alert
          type="error"
          showIcon
          title={error}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return <Typography.Text type="secondary">{children}</Typography.Text>;
}

type Props = {
  sandboxId: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

export function SandboxDetailModal({
  sandboxId,
  open,
  onClose,
  onChanged,
}: Props) {
  const { modal, message } = App.useApp();
  const [sandbox, setSandbox] = useState<Sandbox | null>(null);
  const [resources, setResources] = useState<ResourceSpec | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [env, setEnv] = useState<SandboxEnv[]>([]);
  const [idle, setIdle] = useState({ autoShutdown: false, idleMinutes: 5 });
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null);
  const tagsDirtyRef = useRef(false);
  const envDirtyRef = useRef(false);
  const idleDirtyRef = useRef(false);
  const applyTemplatePendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [templateNames, setTemplateNames] = useState<Map<string, string>>(
    () => new Map(),
  );

  const load = useCallback(async () => {
    try {
      const res = await sandboxClient.getSandbox(sandboxId);
      setSandbox(res.sandbox);
      setResources({
        cpu: res.sandbox.cpu,
        memoryGi: res.sandbox.memoryGi,
        diskGi: res.sandbox.diskGi,
      });
      if (!tagsDirtyRef.current) setTags(res.sandbox.tags);
      if (!envDirtyRef.current) {
        setEnv(
          (res.sandbox.env ?? []).map((item) => ({
            name: item.name,
            value: item.value ?? "",
          })),
        );
      }
      if (!idleDirtyRef.current) {
        setIdle({
          autoShutdown: res.sandbox.autoShutdown ?? false,
          idleMinutes: res.sandbox.idleMinutes ?? 5,
        });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }, [sandboxId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void sandboxClient
      .listTemplates()
      .then((res) => {
        if (cancelled) return;
        setTemplateNames(
          new Map(res.list.map((item) => [item.id, item.name || item.id])),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    tagsDirtyRef.current = false;
    envDirtyRef.current = false;
    idleDirtyRef.current = false;
    applyTemplatePendingRef.current = false;
    setSandbox(null);
    setResources(null);
    setTags([]);
    setEnv([]);
    setTemplateDraft(null);
    setIdle({ autoShutdown: false, idleMinutes: 5 });
    void load();
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load, open]);

  async function save() {
    if (!resources || !sandbox) return;
    const parsedTags = TagsSchema.safeParse(tags);
    if (!parsedTags.success) {
      focusDetailTab("info");
      setError(parsedTags.error.issues[0]?.message ?? "标签无效");
      return;
    }
    const incompleteEnv = env.find(
      (item) => !item.name.trim() && (item.value ?? "").length > 0,
    );
    if (incompleteEnv) {
      focusDetailTab("env");
      setError("环境变量名不能为空");
      return;
    }
    const parsedEnv = z.array(CreateSandboxEnvSchema).safeParse(normalizeEnv(env));
    if (!parsedEnv.success) {
      focusDetailTab("env");
      setError(parsedEnv.error.issues[0]?.message ?? "环境变量无效");
      return;
    }
    const applyTemplate = applyTemplatePendingRef.current;
    const resourceDirty =
      resources.cpu !== sandbox.cpu ||
      resources.memoryGi !== sandbox.memoryGi ||
      resources.diskGi !== sandbox.diskGi;
    const tagsDirty = !sameTags(parsedTags.data, sandbox.tags);
    const envDirty = !sameEnv(parsedEnv.data, sandbox.env ?? []);
    const idleDirty =
      idle.autoShutdown !== (sandbox.autoShutdown ?? false) ||
      idle.idleMinutes !== (sandbox.idleMinutes ?? 5);
    if (
      !applyTemplate &&
      !resourceDirty &&
      !tagsDirty &&
      !envDirty &&
      !idleDirty
    ) {
      return;
    }

    setBusy("update");
    setError(null);
    try {
      await sandboxClient.updateSandbox(sandboxId, {
        // 保存时把本地改动推到 Sealos（含环境变量 / 从模板合并后的配置）
        ...(applyTemplate || resourceDirty ? resources : {}),
        ...(applyTemplate || envDirty ? { env: parsedEnv.data } : {}),
        ...(tagsDirty ? { tags: parsedTags.data } : {}),
        ...(idleDirty
          ? {
            autoShutdown: idle.autoShutdown,
            idleMinutes: idle.idleMinutes,
          }
          : {}),
        ...(applyTemplate ? { applyTemplate: true } : {}),
      });
      tagsDirtyRef.current = false;
      envDirtyRef.current = false;
      idleDirtyRef.current = false;
      applyTemplatePendingRef.current = false;
      setTemplateDraft(null);
      await load();
      await onChanged();
      message.success(applyTemplate ? "已保存并同步到 Sealos" : "已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  const resourceDirty =
    !!sandbox &&
    !!resources &&
    (resources.cpu !== sandbox.cpu ||
      resources.memoryGi !== sandbox.memoryGi ||
      resources.diskGi !== sandbox.diskGi);
  const tagsDirty = !!sandbox && !sameTags(tags, sandbox.tags);
  const envDirty = !!sandbox && !sameEnv(env, sandbox.env ?? []);
  const idleDirty =
    !!sandbox &&
    (idle.autoShutdown !== (sandbox.autoShutdown ?? false) ||
      idle.idleMinutes !== (sandbox.idleMinutes ?? 5));
  const applyTemplatePending = templateDraft !== null;
  const dirty =
    resourceDirty || tagsDirty || envDirty || idleDirty || applyTemplatePending;

  const view = sandbox
    ? {
      image: templateDraft?.image ?? sandbox.image,
      imageRegistry: templateDraft
        ? templateDraft.imageRegistry
        : sandbox.imageRegistry,
      launchCommand: templateDraft?.launchCommand ?? sandbox.launchCommand,
      ports: templateDraft?.ports ?? sandbox.ports ?? [],
      storage: templateDraft?.storage ?? sandbox.storage ?? [],
      configMap: templateDraft?.configMap ?? sandbox.configMap ?? [],
    }
    : null;
  const launchCommand = view?.launchCommand?.command?.trim() || "";
  const launchArgs = (view?.launchCommand?.args ?? []).join(" ");
  const registry = view?.imageRegistry;

  function syncFromTemplate() {
    if (!sandbox?.templateId || !resources) {
      message.warning("该沙箱未关联模板");
      return;
    }
    const templateLabel =
      templateNames.get(sandbox.templateId) || sandbox.templateId;
    modal.confirm({
      title: "从模板更新到表单？",
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>
            将用模板「{templateLabel}」的最新配置填写到表单。点击「保存配置」后才会同步到
            Sealos。
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, color: "rgba(0,0,0,0.65)" }}>
            <li>CPU / 内存 / 磁盘 / 实例数保持不变</li>
            <li>环境变量合并，同名以模板为准</li>
            <li>镜像、命令、网络、目录/文件映射等以模板为准</li>
          </ul>
        </div>
      ),
      okText: "应用到表单",
      cancelText: "取消",
      onOk: async () => {
        setBusy("sync");
        setError(null);
        try {
          const res = await sandboxClient.getTemplate(sandbox.templateId!);
          const template = res.template;
          envDirtyRef.current = true;
          idleDirtyRef.current = true;
          applyTemplatePendingRef.current = true;
          setEnv(mergeEnvWithTemplate(env, template.env));
          setIdle({
            autoShutdown: template.autoShutdown ?? false,
            idleMinutes: template.idleMinutes ?? 5,
          });
          setTemplateDraft(draftFromTemplate(template, resources.diskGi));
          message.success("已应用到表单，请点击保存配置以同步到 Sealos");
        } catch (err) {
          const text = err instanceof Error ? err.message : "加载模板失败";
          setError(text);
          message.error(text);
          throw err;
        } finally {
          setBusy(null);
        }
      },
    });
  }

  return (
    <ProDrawer
      title={sandboxId}
      open={open}
      size="large"
      closable={false}
      key={open ? sandboxId : "closed"}
      defaultActiveTab="info"
      onClose={() => {
        if (busy === null) onClose();
      }}
      extra={
        <Space>
          <Button onClick={onClose} disabled={busy !== null}>
            关闭
          </Button>
          <Button
            loading={busy === "sync"}
            disabled={busy !== null || !sandbox?.templateId}
            onClick={() => syncFromTemplate()}
          >
            从模板更新
          </Button>
          <Button
            type="primary"
            loading={busy === "update"}
            disabled={!dirty || !resources || busy !== null}
            onClick={() => void save()}
          >
            保存配置
          </Button>
        </Space>
      }
      tabs={
        sandbox && resources
          ? [
            {
              key: "info",
              label: "基本信息",
              children: (
                <DetailPane error={error}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "20px 32px",
                    }}
                  >
                    <InfoField label="状态">
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <StateBadge state={sandbox.state} />
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          约每 5 秒刷新
                        </Typography.Text>
                      </span>
                    </InfoField>
                    <InfoField label="当前规格">
                      {sandbox.cpu} 核 · {memoryLabel(sandbox.memoryGi)}
                      {sandbox.replicas > 1
                        ? ` · ${sandbox.replicas} 实例`
                        : null}
                    </InfoField>
                    <InfoField label="模板">
                      {sandbox.templateId ? (
                        <div>
                          <div>
                            {templateNames.get(sandbox.templateId) ||
                              sandbox.templateId}
                          </div>
                          {templateNames.get(sandbox.templateId) &&
                            templateNames.get(sandbox.templateId) !==
                            sandbox.templateId ? (
                            <Typography.Text
                              type="secondary"
                              style={{ fontSize: 12 }}
                            >
                              {sandbox.templateId}
                            </Typography.Text>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </InfoField>
                    <InfoField label="镜像">
                      {view?.image ? (
                        <MonoText>{view.image}</MonoText>
                      ) : (
                        "—"
                      )}
                      {applyTemplatePending ? (
                        <Typography.Text
                          type="warning"
                          style={{ display: "block", fontSize: 12, marginTop: 4 }}
                        >
                          来自模板（未保存）
                        </Typography.Text>
                      ) : null}
                    </InfoField>
                    <InfoField label="私有镜像仓库">
                      {registry ? (
                        <div>
                          <div>
                            {registry.serverAddress || "已配置"}
                            {registry.hasPassword ? (
                              <Tag style={{ marginLeft: 8 }}>已设密码</Tag>
                            ) : null}
                          </div>
                          {registry.username ? (
                            <Typography.Text
                              type="secondary"
                              style={{ fontSize: 12 }}
                            >
                              用户 {registry.username}
                            </Typography.Text>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </InfoField>
                    <InfoField label="运行命令">
                      {launchCommand || launchArgs ? (
                        <div>
                          {launchCommand ? (
                            <div>
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                Command
                              </Typography.Text>
                              <div>
                                <MonoText>{launchCommand}</MonoText>
                              </div>
                            </div>
                          ) : null}
                          {launchArgs ? (
                            <div style={{ marginTop: launchCommand ? 8 : 0 }}>
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                Args
                              </Typography.Text>
                              <div>
                                <MonoText>{launchArgs}</MonoText>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </InfoField>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <InfoField label="标签">
                        <Select
                          mode="tags"
                          value={tags}
                          placeholder="输入后回车，可添加多个"
                          tokenSeparators={[","]}
                          open={false}
                          suffixIcon={null}
                          disabled={busy !== null}
                          style={{ width: "100%" }}
                          onChange={(values: string[]) => {
                            tagsDirtyRef.current = true;
                            setTags(
                              values.map((value) => value.trim()).filter(Boolean),
                            );
                          }}
                        />
                      </InfoField>
                    </div>
                  </div>
                </DetailPane>
              ),
            },
            {
              key: "ports",
              label: "网络配置",
              children: (
                <DetailPane error={error}>
                  <Table
                    size="small"
                    pagination={false}
                    rowKey={(row, index) => `${row.number}-${index}`}
                    dataSource={view?.ports ?? []}
                    locale={{ emptyText: "暂无端口信息" }}
                    columns={[
                      {
                        title: "端口",
                        dataIndex: "number",
                        width: 72,
                        onCell: () => ({ style: { verticalAlign: "top" } }),
                      },
                      {
                        title: "协议",
                        dataIndex: "protocol",
                        width: 80,
                        onCell: () => ({ style: { verticalAlign: "top" } }),
                        render: (value?: string) =>
                          value ? value.toUpperCase() : "—",
                      },
                      {
                        title: "公网",
                        dataIndex: "isPublic",
                        width: 72,
                        onCell: () => ({ style: { verticalAlign: "top" } }),
                        render: (value?: boolean) =>
                          value === undefined ? "—" : value ? "是" : "否",
                      },
                      {
                        title: "公网地址",
                        dataIndex: "publicAddress",
                        onCell: () => ({ style: { verticalAlign: "top" } }),
                        render: (value: string | null) => (
                          <AddressCell value={value} href empty="尚未就绪" />
                        ),
                      },
                      {
                        title: "内网地址",
                        dataIndex: "privateAddress",
                        onCell: () => ({ style: { verticalAlign: "top" } }),
                        render: (value: string | null) => (
                          <AddressCell value={value} empty="—" />
                        ),
                      },
                    ]}
                  />
                </DetailPane>
              ),
            },
            {
              key: "env",
              label: "环境变量",
              children: (
                <DetailPane error={error}>
                  <Table
                    size="small"
                    pagination={false}
                    rowKey={(_, index) => `env-${index}`}
                    dataSource={env}
                    locale={{ emptyText: "暂无环境变量" }}
                    columns={[
                      {
                        title: "变量名",
                        dataIndex: "name",
                        width: "36%",
                        render: (value: string, _, index) => (
                          <Input
                            value={value}
                            placeholder="KEY"
                            disabled={busy !== null}
                            onChange={(e) => {
                              envDirtyRef.current = true;
                              setEnv((list) => {
                                const next = [...list];
                                next[index] = {
                                  ...next[index]!,
                                  name: e.target.value,
                                };
                                return next;
                              });
                            }}
                          />
                        ),
                      },
                      {
                        title: "值",
                        dataIndex: "value",
                        render: (value: string, _, index) => (
                          <Input
                            value={value}
                            placeholder="VALUE"
                            disabled={busy !== null}
                            onChange={(e) => {
                              envDirtyRef.current = true;
                              setEnv((list) => {
                                const next = [...list];
                                next[index] = {
                                  ...next[index]!,
                                  value: e.target.value,
                                };
                                return next;
                              });
                            }}
                          />
                        ),
                      },
                      {
                        title: "",
                        key: "action",
                        width: 64,
                        align: "right" as const,
                        render: (_: unknown, __: SandboxEnv, index: number) => (
                          <Button
                            type="link"
                            danger
                            size="small"
                            style={{ paddingInline: 0 }}
                            disabled={busy !== null}
                            onClick={() => {
                              envDirtyRef.current = true;
                              setEnv((list) =>
                                list.filter((_, i) => i !== index),
                              );
                            }}
                          >
                            删除
                          </Button>
                        ),
                      },
                    ]}
                  />
                  <Button
                    type="dashed"
                    block
                    icon={<PlusOutlined />}
                    disabled={busy !== null}
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      envDirtyRef.current = true;
                      setEnv((list) => [...list, { name: "", value: "" }]);
                    }}
                  >
                    添加环境变量
                  </Button>
                </DetailPane>
              ),
            },
            {
              key: "storage",
              label: "目录映射",
              children: (
                <DetailPane error={error}>
                  <Table
                    size="small"
                    pagination={false}
                    rowKey={(row, index) => `${row.path}-${index}`}
                    dataSource={view?.storage ?? []}
                    locale={{ emptyText: "暂无目录映射" }}
                    columns={[
                      {
                        title: "名称",
                        dataIndex: "name",
                        width: 140,
                        render: (value?: string) => value || "—",
                      },
                      {
                        title: "挂载路径",
                        dataIndex: "path",
                        render: (value: string) => <MonoText>{value}</MonoText>,
                      },
                      {
                        title: "容量",
                        dataIndex: "size",
                        width: 100,
                        render: (value?: string) => value || "—",
                      },
                    ]}
                  />
                </DetailPane>
              ),
            },
            {
              key: "configMap",
              label: "文件映射",
              children: (
                <DetailPane error={error}>
                  {(view?.configMap ?? []).length === 0 ? (
                    <EmptyHint>暂无文件映射</EmptyHint>
                  ) : (
                    <Space
                      direction="vertical"
                      size={12}
                      style={{ width: "100%" }}
                    >
                      {(view?.configMap ?? []).map((item, index) => (
                        <div
                          key={`${item.path}-${index}`}
                          style={{
                            border: "1px solid var(--ant-color-border-secondary, #f0f0f0)",
                            borderRadius: 8,
                            padding: 12,
                          }}
                        >
                          <div
                            style={{
                              marginBottom: 8,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <MonoText>{item.path}</MonoText>
                            {item.value ? (
                              <Typography.Text
                                copyable={{
                                  text: item.value,
                                  tooltips: ["复制内容", "已复制"],
                                }}
                              />
                            ) : null}
                          </div>
                          <pre className="sandbox-shell-block" style={{ margin: 0, maxHeight: 240 }}>
                            {item.value || "（空）"}
                          </pre>
                        </div>
                      ))}
                    </Space>
                  )}
                </DetailPane>
              ),
            },
            {
              key: "resources",
              label: "资源配置",
              children: (
                <DetailPane error={error}>
                  <ResourceConfig
                    value={resources}
                    onChange={setResources}
                    disabled={busy !== null}
                    showDisk={false}
                  />
                  <div style={{ marginTop: 28 }}>
                    <IdleShutdownConfig
                      layout="stack"
                      value={idle}
                      disabled={busy !== null}
                      onChange={(next) => {
                        idleDirtyRef.current = true;
                        setIdle(next);
                      }}
                    />
                  </div>
                </DetailPane>
              ),
            },
          ]
          : undefined
      }
    >
      <div style={{ padding: 20 }}>
        {error ? (
          <Alert type="error" showIcon title={error} />
        ) : (
          <Skeleton active paragraph={{ rows: 8 }} />
        )}
      </div>
    </ProDrawer>
  );
}
