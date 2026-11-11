"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchOutlined } from "@ant-design/icons";
import { App, Button, Checkbox, Form, Input, Spin, theme } from "antd";
import { FormModal } from "listpage-components/FormModal";
import { sandboxClient } from "@/lib/client";
import type { ApiKey } from "@/lib/apikey/schema";
import { MCP_TOOL_LABEL, MCP_TOOL_NAME_LIST, type McpToolName } from "@/lib/mcp/tools";
import type { Sandbox } from "@/lib/sandbox/schema";
import type { Template } from "@/lib/template/schema";

type ToolAccess = "all" | "custom";

type ApiKeyFormValues = {
  name: string;
  sandboxIds?: string[];
  toolAccess: ToolAccess;
  allowedTools?: string[];
};

function toolAccessOf(tools: string[] | null | undefined): ToolAccess {
  return tools && tools.length > 0 ? "custom" : "all";
}

type SandboxChoice = {
  id: string;
  templateName: string;
};

function SandboxPicker({
  id,
  value,
  onChange,
  choices,
  loading,
}: {
  id?: string;
  value?: string[];
  onChange?: (next: string[]) => void;
  choices: SandboxChoice[];
  loading: boolean;
}) {
  const { token } = theme.useToken();
  const [keyword, setKeyword] = useState("");
  const selected = value ?? [];
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return choices;
    return choices.filter(
      (item) =>
        item.id.toLowerCase().includes(query) ||
        item.templateName.toLowerCase().includes(query),
    );
  }, [choices, keyword]);
  const allVisibleSelected =
    visible.length > 0 && visible.every((item) => selectedSet.has(item.id));

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange?.(selected.filter((item) => item !== id));
      return;
    }
    onChange?.([...selected, id]);
  }

  function selectVisible() {
    const next = [...selected];
    const have = new Set(selected);
    for (const item of visible) {
      if (have.has(item.id)) continue;
      have.add(item.id);
      next.push(item.id);
    }
    onChange?.(next);
  }

  return (
    <div
      style={{
        border: `1px solid ${token.colorBorder}`,
        borderRadius: token.borderRadius,
        background: token.colorBgContainer,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "2px 8px 2px 4px",
          borderBottom: `1px solid ${token.colorSplit}`,
        }}
      >
        <Input
          id={id}
          allowClear
          variant="borderless"
          placeholder="搜索沙箱或模板"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
        />
        <span
          style={{
            flex: "none",
            fontSize: 12,
            color: token.colorTextSecondary,
            whiteSpace: "nowrap",
          }}
        >
          已选 {selected.length}
        </span>
      </div>
      <div style={{ maxHeight: 240, overflow: "auto" }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <Spin size="small" />
          </div>
        ) : visible.length === 0 ? (
          <div
            style={{
              padding: "20px 12px",
              textAlign: "center",
              color: token.colorTextSecondary,
              fontSize: 13,
            }}
          >
            {choices.length === 0 ? "还没有沙箱" : "没有匹配的沙箱"}
          </div>
        ) : (
          visible.map((item) => {
            const checked = selectedSet.has(item.id);
            return (
              <label
                key={item.id}
                className={
                  checked ? "apikey-sandbox-row is-selected" : "apikey-sandbox-row"
                }
              >
                <Checkbox checked={checked} onChange={() => toggle(item.id)} />
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--font-mono)",
                      fontSize: 13,
                      lineHeight: "20px",
                    }}
                  >
                    {item.id}
                  </span>
                  {item.templateName ? (
                    <span
                      style={{
                        display: "block",
                        marginTop: 2,
                        fontSize: 12,
                        lineHeight: "18px",
                        color: token.colorTextSecondary,
                      }}
                    >
                      {item.templateName}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })
        )}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "4px 12px",
          borderTop: `1px solid ${token.colorSplit}`,
        }}
      >
        <Button
          type="link"
          size="small"
          disabled={loading || allVisibleSelected || visible.length === 0}
          onClick={selectVisible}
          style={{ padding: 0, height: "auto" }}
        >
          全选
        </Button>
        <Button
          type="link"
          size="small"
          disabled={selected.length === 0}
          onClick={() => onChange?.([])}
          style={{ padding: 0, height: "auto" }}
        >
          清空
        </Button>
      </div>
    </div>
  );
}

const TOOL_ACCESS_OPTIONS: { value: ToolAccess; label: string }[] = [
  { value: "all", label: "不限制（全部）" },
  { value: "custom", label: "自定义" },
];

function ToolAccessSwitch({
  value,
  onChange,
}: {
  value?: ToolAccess;
  onChange?: (value: ToolAccess) => void;
}) {
  const { token } = theme.useToken();
  const current = value ?? "all";
  return (
    <div
      role="radiogroup"
      aria-label="工具权限"
      style={{
        display: "flex",
        width: "100%",
        padding: 2,
        borderRadius: token.borderRadius,
        background: token.colorFillTertiary,
      }}
    >
      {TOOL_ACCESS_OPTIONS.map((option) => {
        const selected = current === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange?.(option.value)}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              height: 28,
              margin: 0,
              padding: "0 8px",
              border: 0,
              borderRadius: token.borderRadiusSM,
              background: selected ? token.colorBgContainer : "transparent",
              boxShadow: selected ? token.boxShadowTertiary : "none",
              color: selected ? token.colorText : token.colorTextSecondary,
              font: "inherit",
              fontSize: token.fontSize,
              lineHeight: "28px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ToolChips({
  value,
  onChange,
}: {
  value?: string[];
  onChange?: (next: string[]) => void;
}) {
  const { token } = theme.useToken();
  const selected = new Set(value ?? []);

  function toggle(name: McpToolName) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange?.(MCP_TOOL_NAME_LIST.filter((item) => next.has(item)));
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, width: "100%", minWidth: 0 }}>
      {MCP_TOOL_NAME_LIST.map((name) => {
        const on = selected.has(name);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(name)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 32,
              margin: 0,
              padding: "0 10px",
              borderRadius: token.borderRadius,
              border: `1px solid ${on ? token.colorPrimary : token.colorBorder}`,
              background: on ? token.colorPrimaryBg : token.colorBgContainer,
              color: on ? token.colorPrimary : token.colorText,
              cursor: "pointer",
              font: "inherit",
              lineHeight: 1,
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{name}</span>
            <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
              {MCP_TOOL_LABEL[name]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

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
  const { token } = theme.useToken();
  const [form] = Form.useForm<ApiKeyFormValues>();
  const watchedAccess = Form.useWatch("toolAccess", form);
  const watchedTools = Form.useWatch("allowedTools", form);
  const toolAccess = watchedAccess ?? toolAccessOf(editing?.allowedTools);
  const allowedTools = watchedTools ?? editing?.allowedTools ?? [];
  const needsTool = toolAccess === "custom" && allowedTools.length === 0;
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sandboxesLoading, setSandboxesLoading] = useState(false);

  const loadSandboxes = useCallback(async () => {
    setSandboxesLoading(true);
    try {
      const [sandboxRes, templateRes] = await Promise.all([
        sandboxClient.listSandboxes(),
        sandboxClient.listTemplates().catch(() => ({ list: [] as Template[], total: 0 })),
      ]);
      setSandboxes(sandboxRes.list);
      setTemplates(templateRes.list);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "沙箱列表加载失败");
    } finally {
      setSandboxesLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (open) void loadSandboxes();
  }, [loadSandboxes, open]);

  const sandboxChoices = useMemo(() => {
    const templateNameById = new Map(
      templates.map((item) => [item.id, item.name || item.id]),
    );
    const known = sandboxes.map((item) => ({
      id: item.id,
      templateName: item.templateId
        ? templateNameById.get(item.templateId) || item.templateId
        : "",
    }));
    const knownIds = new Set(known.map((item) => item.id));
    const missing = (editing?.sandboxIds ?? [])
      .filter((id) => !knownIds.has(id))
      .map((id) => ({ id, templateName: "当前列表中已没有" }));
    return [...missing, ...known];
  }, [editing, sandboxes, templates]);

  async function save(values: ApiKeyFormValues) {
    const trimmed = values.name.trim();
    if (!trimmed) {
      message.error("请填写名称");
      throw new Error("名称必填");
    }
    const sandboxIds = values.sandboxIds ?? [];
    const allowedTools =
      values.toolAccess === "custom" ? (values.allowedTools ?? []) : null;
    if (allowedTools && allowedTools.length === 0) {
      message.error("至少选择一个工具");
      throw new Error("至少选择一个工具");
    }
    if (editing) {
      await sandboxClient.updateApiKey(editing.id, {
        name: trimmed,
        sandboxIds,
        allowedTools,
      });
      message.success("已保存");
    } else {
      await sandboxClient.createApiKey({
        name: trimmed,
        sandboxIds,
        allowedTools,
      });
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
        toolAccess: toolAccessOf(editing?.allowedTools),
        allowedTools: editing?.allowedTools ?? [],
      }}
      onCancel={onClose}
      onOk={save}
      modalProps={{
        centered: true,
        width: 520,
        okText: editing ? "保存" : "创建",
        okButtonProps: { disabled: needsTool },
      }}
      formProps={{
        form,
        className: "apikey-form",
        layout: "horizontal",
        labelCol: { flex: "88px" },
        wrapperCol: { flex: "1 1 0", style: { minWidth: 0, maxWidth: "100%" } },
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
      >
        <SandboxPicker
          choices={sandboxChoices}
          loading={sandboxesLoading}
        />
      </Form.Item>
      <Form.Item
        label="工具权限"
        className="apikey-tool-field"
        style={{ marginBottom: 0 }}
        labelCol={{ flex: "0 0 88px" }}
        wrapperCol={{ flex: "1 1 0", style: { minWidth: 0, maxWidth: "100%" } }}
      >
        <Form.Item name="toolAccess" noStyle>
          <ToolAccessSwitch />
        </Form.Item>
        {toolAccess === "custom" ? (
          <div style={{ marginTop: 12, width: "100%", minWidth: 0 }}>
            <Form.Item name="allowedTools" noStyle>
              <ToolChips />
            </Form.Item>
            {needsTool ? (
              <div style={{ marginTop: 8, fontSize: 12, lineHeight: "20px", color: token.colorTextSecondary }}>
                至少选择一个工具
              </div>
            ) : null}
          </div>
        ) : null}
      </Form.Item>
    </FormModal>
  );
}
