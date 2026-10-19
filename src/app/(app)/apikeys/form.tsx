"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Form, Input, Select } from "antd";
import { FormModal } from "listpage-components/FormModal";
import { boatClient } from "@/lib/client";
import type { ApiKey } from "@/lib/apikey/schema";
import type { Sandbox } from "@/lib/sandbox/schema";
import type { Template } from "@/lib/template/schema";

type ApiKeyFormValues = { name: string; sandboxIds?: string[] };

export function ApiKeyFormModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: ApiKey | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sandboxesLoading, setSandboxesLoading] = useState(false);

  const loadSandboxes = useCallback(async () => {
    setSandboxesLoading(true);
    try {
      const [sandboxRes, templateRes] = await Promise.all([
        boatClient.listSandboxes(),
        boatClient.listTemplates().catch(() => ({ templates: [] as Template[] })),
      ]);
      setSandboxes(sandboxRes.sandboxes);
      setTemplates(templateRes.templates);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "沙箱列表加载失败");
    } finally {
      setSandboxesLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (open) void loadSandboxes();
  }, [loadSandboxes, open]);

  const sandboxOptions = useMemo(() => {
    const templateNameById = new Map(
      templates.map((item) => [item.id, item.name || item.id]),
    );
    return sandboxes.map((item) => ({
      value: item.id,
      label: item.id,
      templateName: item.templateId
        ? templateNameById.get(item.templateId) || item.templateId
        : "",
    }));
  }, [sandboxes, templates]);

  async function save(values: ApiKeyFormValues) {
    const trimmed = values.name.trim();
    if (!trimmed) {
      message.error("请填写名称");
      throw new Error("名称必填");
    }
    const sandboxIds = values.sandboxIds ?? [];
    if (editing) {
      await boatClient.updateApiKey(editing.id, { name: trimmed, sandboxIds });
      message.success("已保存");
    } else {
      await boatClient.createApiKey({ name: trimmed, sandboxIds });
      message.success("令牌已创建");
    }
    onClose();
    onSaved();
  }

  return (
    <FormModal<ApiKeyFormValues>
      title={editing ? "编辑令牌" : "新建令牌"}
      open={open}
      initialValues={{
        name: editing?.name ?? "",
        sandboxIds: editing?.sandboxIds ?? [],
      }}
      onCancel={onClose}
      onOk={save}
      modalProps={{ centered: true, width: 480, okText: editing ? "保存" : "创建" }}
      formProps={{
        layout: "horizontal",
        labelCol: { flex: "72px" },
        wrapperCol: { flex: 1 },
        labelAlign: "right",
        colon: false,
        style: { marginTop: 16 },
      }}
    >
      <Form.Item
        label="名称"
        name="name"
        rules={[{ required: true, message: "请填写名称" }]}
      >
        <Input maxLength={64} placeholder="例如 CI、本地脚本" autoFocus />
      </Form.Item>
      <Form.Item
        label="沙箱"
        name="sandboxIds"
        extra="用这把令牌新建的沙箱会自动加入"
        style={{ marginBottom: 0 }}
      >
        <Select
          mode="multiple"
          allowClear
          showSearch
          placeholder="选择允许访问的沙箱"
          loading={sandboxesLoading}
          options={sandboxOptions}
          filterOption={(input, option) => {
            const keyword = input.trim().toLowerCase();
            if (!keyword) return true;
            const label = String(option?.label ?? "").toLowerCase();
            const templateName = String(option?.templateName ?? "").toLowerCase();
            return label.includes(keyword) || templateName.includes(keyword);
          }}
          optionRender={(option) => (
            <div style={{ padding: "2px 0", lineHeight: 1.35 }}>
              <div>{option.label}</div>
              {option.data.templateName ? (
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 12,
                    color: "var(--ant-color-text-secondary)",
                  }}
                >
                  {option.data.templateName}
                </div>
              ) : null}
            </div>
          )}
        />
      </Form.Item>
    </FormModal>
  );
}
