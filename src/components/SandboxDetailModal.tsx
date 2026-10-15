"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Flex,
  Modal,
  Skeleton,
  Space,
  Typography,
} from "antd";
import { ResourceConfig } from "@/components/ResourceConfig";
import { StateBadge } from "@/components/StateBadge";
import { boatClient } from "@/lib/client";
import type { Sandbox } from "@/lib/sandbox/schema";
import { memoryLabel, type ResourceSpec } from "@/lib/sealos/resources";

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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }, [sandboxId]);

  useEffect(() => {
    if (!open) return;
    setSandbox(null);
    setResources(null);
    void load();
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load, open]);

  async function save() {
    if (!resources) return;
    setBusy("update");
    setError(null);
    try {
      await boatClient.updateSandbox(sandboxId, resources);
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  const dirty =
    !!sandbox &&
    !!resources &&
    (resources.cpu !== sandbox.cpu ||
      resources.memoryGi !== sandbox.memoryGi ||
      resources.diskGi !== sandbox.diskGi);

  return (
    <Modal
      title={sandboxId}
      open={open}
      onCancel={onClose}
      centered
      destroyOnHidden
      width={640}
      styles={{ body: { minHeight: 380 } }}
      mask={{ closable: busy === null }}
      closable={busy === null}
      footer={
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
                key: "url",
                label: "公网地址",
                children: sandbox.publicUrl ? (
                  <Space wrap>
                    <Typography.Link href={sandbox.publicUrl} target="_blank">
                      {sandbox.publicUrl}
                    </Typography.Link>
                    <Button
                      size="small"
                      onClick={() =>
                        void navigator.clipboard.writeText(sandbox.publicUrl!)
                      }
                    >
                      复制
                    </Button>
                  </Space>
                ) : (
                  <Typography.Text type="secondary">
                    尚未就绪，进入运行中后会自动出现
                  </Typography.Text>
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
            />
          </div>
        </Space>
      )}
    </Modal>
  );
}
