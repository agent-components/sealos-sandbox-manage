import { useEffect, useState } from "react";
import { EditOutlined, EllipsisOutlined, SyncOutlined } from "@ant-design/icons";
import { App, Button, Dropdown, Space, Switch, Tag, Tooltip, Typography } from "antd";
import type {
  ListPageColumnType,
  ListPageContextValue,
} from "listpage-components";
import { StateBadge } from "../components/StateBadge";
import { TemplateDiffList } from "../components/TemplateDiffList";
import { trpc } from '@/api/trpc';
import { cursorIdeUrl } from "@/modules/sandbox/ide";
import { previewTemplateApply } from "@/modules/sandbox/template-apply-diff";
import type { Sandbox } from "@/modules/sandbox/schema";
import type { SandboxFilters } from './filters';

let templateNames: Map<string, string> | null = null;

function TemplateNameCell({ id }: { id?: string }) {
  const [, setRevision] = useState(0);

  useEffect(() => {
    if (templateNames) return;
    void trpc.templates.list.query().then((res) => {
      templateNames = new Map(
        res.list.map((item) => [item.id, item.name || item.id]),
      );
      setRevision((n) => n + 1);
    });
  }, []);

  if (!id) return <>—</>;
  const name = templateNames?.get(id);
  return (
    <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
      {name || id}
    </Typography.Text>
  );
}

function formatTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function canStop(state: Sandbox["state"]) {
  return state === "running" || state === "starting";
}

export function canStart(state: Sandbox["state"]) {
  return state === "stopped" || state === "error";
}

function PowerSwitch({
  record,
  ctx,
}: {
  record: Sandbox;
  ctx: ListPageContextValue<Sandbox, SandboxFilters>;
}) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const poweredOn = canStop(record.state);
  const disabled =
    busy || (!canStop(record.state) && !canStart(record.state));

  async function onChange(checked: boolean) {
    setBusy(true);
    try {
      if (checked) {
        await trpc.sandboxes.resume.mutate({ id: record.id });
        message.success("已开机");
      } else {
        await trpc.sandboxes.stop.mutate({ id: record.id });
        message.success("已关机");
      }
      ctx.refreshTable();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Switch
      size="small"
      checked={poweredOn}
      loading={busy}
      disabled={disabled && !busy}
      onChange={(checked) => void onChange(checked)}
      aria-label={poweredOn ? "关机" : "开机"}
    />
  );
}

function SandboxActions({
  record,
  ctx,
}: {
  record: Sandbox;
  ctx: ListPageContextValue<Sandbox, SandboxFilters>;
}) {
  const { message, modal } = App.useApp();
  const [syncing, setSyncing] = useState(false);

  async function applyLatestTemplate() {
    if (!record.templateId) {
      message.warning("该沙箱未关联模板");
      return;
    }
    setSyncing(true);
    try {
      const [{ sandbox }, { template }] = await Promise.all([
        trpc.sandboxes.get.query({ id: record.id }),
        trpc.templates.get.query({ id: record.templateId }),
      ]);
      const { diffs } = previewTemplateApply(sandbox, template);
      if (diffs.length === 0) {
        message.info("已经是最新模板状态");
        return;
      }
      modal.confirm({
        title: "应用最新模板？",
        width: 560,
        content: (
          <div>
            <p style={{ marginBottom: 8 }}>
              与最新模板有 {diffs.length} 处差异。确认后会立即同步到 Sealos。资源配置（CPU / 内存 / 磁盘 / 实例数）保持不变。
            </p>
            <TemplateDiffList items={diffs} />
          </div>
        ),
        okText: "应用",
        cancelText: "取消",
        onOk: async () => {
          await trpc.sandboxes.syncTemplate.mutate({ id: record.id });
          message.success("已按最新模板更新");
          ctx.refreshTable();
        },
      });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "应用最新模板失败");
    } finally {
      setSyncing(false);
    }
  }

  async function openIde() {
    try {
      // 列表项不含 ports；公网地址在详情里
      const { sandbox } = await trpc.sandboxes.get.query({ id: record.id });
      // exec 进容器时 cwd 即镜像 WORKDIR
      let workdir = "/";
      try {
        const cmd = await trpc.sandboxes.runCommand.mutate({ id: record.id, body: { command: "pwd" } });
        if (cmd.ok) {
          const line = cmd.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
          if (line) workdir = line;
        }
      } catch {
        // pwd 失败则退回 /
      }
      const result = cursorIdeUrl(sandbox, workdir);
      if (!result.ok) {
        message.error(result.error);
        return;
      }
      window.location.href = result.url;
    } catch (err) {
      message.error(err instanceof Error ? err.message : "打开 IDE 失败");
    }
  }

  const running = record.state === "running";
  const logsAvailable =
    record.state === "starting" || record.state === "running";

  return (
    <Space size={4} style={{ whiteSpace: "nowrap" }}>
      <Tooltip title="编辑">
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          aria-label="编辑"
          onClick={() => ctx.showFloat("detail", record)}
        />
      </Tooltip>
      <Tooltip title="更新">
        <Button
          type="link"
          size="small"
          icon={<SyncOutlined />}
          aria-label="更新"
          loading={syncing}
          onClick={() => void applyLatestTemplate()}
        />
      </Tooltip>
      <Dropdown
        trigger={["click"]}
        placement="bottomRight"
        menu={{
          items: [
            { key: "ide", label: "IDE", disabled: !running },
            { key: "desktop", label: "桌面", disabled: !running },
            { key: "logs", label: "日志", disabled: !logsAvailable },
            { key: "disk", label: "占用检查", disabled: !running },
            { type: "divider" },
            { key: "delete", danger: true, label: "删除" },
          ],
          onClick: ({ key }) => {
            if (key === "ide") void openIde();
            if (key === "desktop") ctx.showFloat("desktop", record);
            if (key === "logs" && logsAvailable) ctx.showFloat("logs", record);
            if (key === "disk") ctx.showFloat("disk", record);
            if (key === "delete") ctx.showFloat("delete", record);
          },
        }}
      >
        <Tooltip title="更多">
          <Button
            type="link"
            size="small"
            icon={<EllipsisOutlined />}
            aria-label="更多"
          />
        </Tooltip>
      </Dropdown>
    </Space>
  );
}

export function createSandboxColumns(): ListPageColumnType<
  Sandbox,
  SandboxFilters
>[] {
  return [
    {
      title: "电源",
      key: "power",
      width: 72,
      fixed: "left",
      align: "center",
      component: ({ record, ctx }) => (
        <PowerSwitch record={record} ctx={ctx} />
      ),
    },
    {
      title: "名称",
      dataIndex: "id",
      key: "id",
      width: 160,
      fixed: "left",
      ellipsis: { showTitle: false },
      render: (id: string) => (
        <Typography.Text
          strong
          ellipsis={{ tooltip: id }}
          style={{ fontFamily: "var(--font-mono)", width: "100%" }}
        >
          {id}
        </Typography.Text>
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
      title: "模板",
      dataIndex: "templateId",
      key: "templateId",
      width: 180,
      render: (id?: string) => <TemplateNameCell id={id} />,
    },
    {
      title: "区域",
      dataIndex: "regionName",
      key: "region",
      width: 88,
      render: (_: string | undefined, row: Sandbox) => (
        <Typography.Text type="secondary" style={{ whiteSpace: "nowrap" }}>
          {row.regionName || row.regionId || "—"}
        </Typography.Text>
      ),
    },
    {
      title: "标签",
      dataIndex: "tags",
      key: "tags",
      width: 220,
      component: ({ record, ctx }) =>
        record.tags.length > 0 ? (
          <Space size={4} wrap>
            {record.tags.map((tag) => (
              <Tag
                key={tag}
                style={{ marginInlineEnd: 0, cursor: "pointer" }}
                onClick={() =>
                  ctx.submitFilters({ ...ctx.filters, tag })
                }
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
      title: "进行中",
      dataIndex: "inflight",
      key: "inflight",
      width: 90,
      align: "right",
      render: (value?: number) => (
        <Typography.Text
          type={value && value > 0 ? undefined : "secondary"}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {value ?? 0}
        </Typography.Text>
      ),
    },
    {
      title: "上次活跃",
      dataIndex: "lastActivityAt",
      key: "lastActivityAt",
      width: 170,
      sorter: true,
      render: (value?: string) => (
        <Typography.Text type="secondary">{formatTime(value)}</Typography.Text>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 108,
      align: "right",
      fixed: "right",
      component: ({ record, ctx }) => (
        <SandboxActions record={record} ctx={ctx} />
      ),
    },
  ];
}
