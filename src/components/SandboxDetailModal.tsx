"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Flex,
  Select,
  Skeleton,
  Space,
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
      size={720}
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
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {!sandbox || !resources ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <Flex align="center" gap={12}>
            <StateBadge state={sandbox.state} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              状态约每 5 秒刷新
            </Typography.Text>
          </Flex>

          <Descriptions
            size="small"
            column={1}
            bordered
            items={[
              {
                key: "ports",
                label: "端口与地址",
                children:
                  (sandbox.ports ?? []).length > 0 ? (
                    <Space direction="vertical" size={12} style={{ width: "100%" }}>
                      {(sandbox.ports ?? []).map((port) => (
                        <div key={port.number}>
                          <Typography.Text strong>端口 {port.number}</Typography.Text>
                          <div style={{ marginTop: 4 }}>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              公网
                            </Typography.Text>
                            <div>
                              {port.publicAddress ? (
                                <Space wrap size={8}>
                                  <Typography.Link
                                    href={
                                      port.publicAddress.startsWith("http")
                                        ? port.publicAddress
                                        : `https://${port.publicAddress}`
                                    }
                                    target="_blank"
                                  >
                                    {port.publicAddress}
                                  </Typography.Link>
                                  <Button
                                    size="small"
                                    onClick={() =>
                                      void navigator.clipboard.writeText(
                                        port.publicAddress!,
                                      )
                                    }
                                  >
                                    复制
                                  </Button>
                                </Space>
                              ) : (
                                <Typography.Text type="secondary">
                                  尚未就绪
                                </Typography.Text>
                              )}
                            </div>
                          </div>
                          <div style={{ marginTop: 4 }}>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              内网
                            </Typography.Text>
                            <div>
                              {port.privateAddress ? (
                                <Space wrap size={8}>
                                  <Typography.Text copyable>
                                    {port.privateAddress}
                                  </Typography.Text>
                                </Space>
                              ) : (
                                <Typography.Text type="secondary">—</Typography.Text>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </Space>
                  ) : (
                    <Typography.Text type="secondary">暂无端口信息</Typography.Text>
                  ),
              },
              {
                key: "template",
                label: "模板",
                children: sandbox.templateId || "—",
              },
              {
                key: "image",
                label: "镜像",
                children: sandbox.image || "—",
              },
              {
                key: "spec",
                label: "当前规格",
                children: `${sandbox.cpu} 核 · ${memoryLabel(sandbox.memoryGi)} · ${sandbox.diskGi}Gi`,
              },
              {
                key: "tags",
                label: "标签",
                children: (
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
                ),
              },
            ]}
          />

          <div>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              资源配置
            </Typography.Title>
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
          </div>
        </Space>
      )}
    </ProDrawer>
  );
}
