"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Collapse,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Typography,
} from "antd";
import { EnvTextEditor } from "@/components/EnvTextEditor";
import { IdleShutdownConfig } from "@/components/IdleShutdownConfig";
import { ResourceConfig } from "@/components/ResourceConfig";
import { sandboxClient } from "@/lib/client";
import { formatEnvText, parseEnvText } from "@/lib/env-text";
import { TagsSchema } from "@/lib/sandbox/schema";
import {
  DEFAULT_RESOURCES,
  nearestCpu,
  nearestMemoryGi,
  type ResourceSpec,
} from "@/lib/sealos/resources";
import type { Template } from "@/lib/template/schema";
import { primaryDiskGi } from "@/lib/template/schema";

export function CreateSandboxModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [resources, setResources] = useState<ResourceSpec>(DEFAULT_RESOURCES);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createTags, setCreateTags] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [createEnvText, setCreateEnvText] = useState("");
  const [createIdle, setCreateIdle] = useState({
    autoShutdown: false,
    idleMinutes: 5,
  });

  function applyTemplate(tpl: Template) {
    setTemplateId(tpl.id);
    setResources({
      cpu: nearestCpu(tpl.cpu),
      memoryGi: nearestMemoryGi(tpl.memoryGi),
      diskGi: primaryDiskGi(tpl.storage),
    });
    setCreateEnvText(formatEnvText(tpl.env ?? []));
    setCreateIdle({
      autoShutdown: tpl.autoShutdown ?? false,
      idleMinutes: tpl.idleMinutes ?? 5,
    });
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void sandboxClient
      .listTemplates()
      .then((res) => {
        if (cancelled) return;
        if (res.list.length === 0) {
          message.warning("请先创建模板，再创建沙箱");
          onClose();
          router.push("/templates");
          return;
        }
        setTemplates(res.list);
        applyTemplate(res.list[0]!);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        message.error(err instanceof Error ? err.message : "加载模板失败");
        onClose();
      });
    return () => {
      cancelled = true;
    };
    // 浮层挂载时加载一次。列表自动刷新会重渲染，不能把 onClose 放进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onSelectTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (tpl) applyTemplate(tpl);
  }

  async function create() {
    if (!templateId) {
      message.error("请选择模板");
      return;
    }
    const name = createName.trim();
    if (name) {
      if (name.length > 48 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
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
    const parsedEnv = parseEnvText(createEnvText);
    if (!parsedEnv.ok) {
      setAdvancedOpen(true);
      message.error(parsedEnv.error);
      return;
    }
    setCreating(true);
    try {
      await sandboxClient.createSandbox({
        templateId,
        cpu: resources.cpu,
        memoryGi: resources.memoryGi,
        diskGi: resources.diskGi,
        env: parsedEnv.env,
        tags: parsedTags.data,
        autoShutdown: createIdle.autoShutdown,
        idleMinutes: createIdle.idleMinutes,
        ...(name ? { name } : {}),
      });
      message.success("沙箱已创建");
      onClose();
      onSaved();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal
      title="新建沙箱"
      open={open}
      onCancel={() => {
        if (!creating) onClose();
      }}
      centered
      destroyOnHidden
      width={560}
      confirmLoading={creating}
      okText="创建"
      cancelText="取消"
      okButtonProps={{ disabled: !templateId }}
      cancelButtonProps={{ disabled: creating }}
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
              setCreateTags(values.map((value) => value.trim()).filter(Boolean))
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
                <Space orientation="vertical" size={20} style={{ width: "100%" }}>
                  <div>
                    <Typography.Text
                      strong
                      style={{ display: "block", marginBottom: 10 }}
                    >
                      环境变量
                    </Typography.Text>
                    <EnvTextEditor
                      value={createEnvText}
                      disabled={creating}
                      onChange={setCreateEnvText}
                    />
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
  );
}
