"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Button,
  Select,
  Skeleton,
  Space,
  Table,
  Typography,
} from "antd";
import { ProDrawer } from "listpage-components/ProDrawer";
import { IdleShutdownConfig } from "@/components/IdleShutdownConfig";
import { ResourceConfig } from "@/components/ResourceConfig";
import { StateBadge } from "@/components/StateBadge";
import { boatClient } from "@/lib/client";
import { TagsSchema, type Sandbox } from "@/lib/sandbox/schema";
import { memoryLabel, type ResourceSpec } from "@/lib/sealos/resources";

function sameTags(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every(
    (tag, index) =>
      tag.toLocaleLowerCase() === right[index]?.toLocaleLowerCase(),
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
          message={error}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      {children}
    </div>
  );
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
  const [sandbox, setSandbox] = useState<Sandbox | null>(null);
  const [resources, setResources] = useState<ResourceSpec | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [idle, setIdle] = useState({ autoShutdown: false, idleMinutes: 5 });
  const tagsDirtyRef = useRef(false);
  const idleDirtyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [templateNames, setTemplateNames] = useState<Map<string, string>>(
    () => new Map(),
  );

  const load = useCallback(async () => {
    try {
      const res = await boatClient.getSandbox(sandboxId);
      setSandbox(res.sandbox);
      setResources({
        cpu: res.sandbox.cpu,
        memoryGi: res.sandbox.memoryGi,
        diskGi: res.sandbox.diskGi,
      });
      if (!tagsDirtyRef.current) setTags(res.sandbox.tags);
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
    void boatClient
      .listTemplates()
      .then((res) => {
        if (cancelled) return;
        setTemplateNames(
          new Map(res.templates.map((item) => [item.id, item.name || item.id])),
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
    idleDirtyRef.current = false;
    setSandbox(null);
    setResources(null);
    setTags([]);
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
    const resourceDirty =
      resources.cpu !== sandbox.cpu ||
      resources.memoryGi !== sandbox.memoryGi ||
      resources.diskGi !== sandbox.diskGi;
    const tagsDirty = !sameTags(parsedTags.data, sandbox.tags);
    const idleDirty =
      idle.autoShutdown !== (sandbox.autoShutdown ?? false) ||
      idle.idleMinutes !== (sandbox.idleMinutes ?? 5);
    if (!resourceDirty && !tagsDirty && !idleDirty) return;

    setBusy("update");
    setError(null);
    try {
      await boatClient.updateSandbox(sandboxId, {
        ...(resourceDirty ? resources : {}),
        ...(tagsDirty ? { tags: parsedTags.data } : {}),
        ...(idleDirty
          ? {
            autoShutdown: idle.autoShutdown,
            idleMinutes: idle.idleMinutes,
          }
          : {}),
      });
      tagsDirtyRef.current = false;
      idleDirtyRef.current = false;
      await load();
      await onChanged();
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
  const idleDirty =
    !!sandbox &&
    (idle.autoShutdown !== (sandbox.autoShutdown ?? false) ||
      idle.idleMinutes !== (sandbox.idleMinutes ?? 5));
  const dirty = resourceDirty || tagsDirty || idleDirty;

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
            type="primary"
            loading={busy === "update"}
            disabled={!dirty || !resources}
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
                      {sandbox.image ? (
                        <Typography.Text
                          style={{
                            fontFamily: "var(--font-mono)",
                            wordBreak: "break-all",
                          }}
                        >
                          {sandbox.image}
                        </Typography.Text>
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
              label: "端口与地址",
              children: (
                <DetailPane error={error}>
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="number"
                    dataSource={sandbox.ports ?? []}
                    locale={{ emptyText: "暂无端口信息" }}
                    columns={[
                      {
                        title: "端口",
                        dataIndex: "number",
                        width: 72,
                        onCell: () => ({ style: { verticalAlign: "top" } }),
                      },
                      {
                        title: "公网",
                        dataIndex: "publicAddress",
                        onCell: () => ({ style: { verticalAlign: "top" } }),
                        render: (value: string | null) => (
                          <AddressCell value={value} href empty="尚未就绪" />
                        ),
                      },
                      {
                        title: "内网",
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
          <Alert type="error" showIcon message={error} />
        ) : (
          <Skeleton active paragraph={{ rows: 8 }} />
        )}
      </div>
    </ProDrawer>
  );
}
