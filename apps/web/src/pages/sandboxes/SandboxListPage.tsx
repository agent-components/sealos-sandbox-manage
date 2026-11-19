import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Typography } from "antd";
import {
  ListPage,
  useListPageContext,
  type FloatComponentProps,
} from "listpage-components/ListPage";
import { AutoRefreshList } from "@/components/list-page";
import { SandboxDesktopModal } from "@/components/SandboxDesktopModal";
import { SandboxDetailModal } from "@/components/SandboxDetailModal";
import { SandboxDiskUsageModal } from "@/components/SandboxDiskUsageModal";
import { SandboxLogsModal } from "@/components/SandboxLogsModal";
import { trpc } from '@/api/trpc';
import type { Sandbox } from "@/lib/sandbox/schema";
import type { Template } from "@/lib/template/schema";
import { sandboxColumns } from "./columns";
import { CreateSandboxModal } from "./create";
import { DeleteSandboxModal } from "./delete";
import { sandboxFilters, type SandboxFilters } from "./filters";
import { SandboxTable } from "./table";

function CreateSandboxFloat({
  onClose,
  onNavigateTemplates,
}: FloatComponentProps<Sandbox> & { onNavigateTemplates?: () => void }) {
  const { refreshTable } = useListPageContext<Sandbox, SandboxFilters>();
  return (
    <CreateSandboxModal
      open
      onClose={() => onClose()}
      onSaved={refreshTable}
      onNavigateTemplates={onNavigateTemplates}
    />
  );
}

function DetailFloat({ record, onClose }: FloatComponentProps<Sandbox>) {
  const { refreshTable } = useListPageContext<Sandbox, SandboxFilters>();
  return (
    <SandboxDetailModal
      sandboxId={record?.id ?? ""}
      open
      onClose={() => onClose()}
      onChanged={refreshTable}
    />
  );
}

function LogsFloat({ record, onClose }: FloatComponentProps<Sandbox>) {
  return (
    <SandboxLogsModal
      sandboxId={record?.id ?? ""}
      open
      onClose={() => onClose()}
    />
  );
}

function DesktopFloat({ record, onClose }: FloatComponentProps<Sandbox>) {
  return (
    <SandboxDesktopModal
      sandboxId={record?.id ?? ""}
      open
      onClose={() => onClose()}
    />
  );
}

function DiskFloat({ record, onClose }: FloatComponentProps<Sandbox>) {
  return (
    <SandboxDiskUsageModal
      sandboxId={record?.id ?? ""}
      open
      onClose={() => onClose()}
    />
  );
}

function DeleteFloat({ record, onClose }: FloatComponentProps<Sandbox>) {
  const { refreshTable } = useListPageContext<Sandbox, SandboxFilters>();
  return (
    <DeleteSandboxModal
      sandbox={record ?? null}
      open
      onClose={() => onClose()}
      onSaved={refreshTable}
    />
  );
}

function OpenInitialSandboxView({
  sandboxId,
  onConsumed,
}: {
  sandboxId: string | null;
  onConsumed?: () => void;
}) {
  const ctx = useListPageContext<Sandbox, SandboxFilters>();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!sandboxId) {
      handled.current = null;
      return;
    }
    if (handled.current === sandboxId) return;
    handled.current = sandboxId;
    ctx.showFloat("detail", { id: sandboxId } as Sandbox);
    onConsumed?.();
  }, [ctx, onConsumed, sandboxId]);

  return null;
}

export function SandboxListPage({
  initialViewSandboxId = null,
  onConsumedInitialView,
  onNavigateTemplates,
}: {
  initialViewSandboxId?: string | null;
  onConsumedInitialView?: () => void;
  onNavigateTemplates?: () => void;
}) {
  const { message } = App.useApp();
  const [templates, setTemplates] = useState<Template[]>([]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await trpc.templates.list.query();
      setTemplates(res.list);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载模板失败");
    }
  }, [message]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const request = useCallback(
    async (
      page: { current: number; pageSize: number },
      filters: SandboxFilters,
      sort?: { field?: string; order?: "ascend" | "descend" | null },
    ) => {
      try {
        const res = await trpc.sandboxes.list.query({
          current: page.current,
          pageSize: page.pageSize,
          ...(filters.q?.trim() ? { keyword: filters.q.trim() } : {}),
          ...(filters.tag?.trim() ? { q: filters.tag.trim() } : {}),
          ...(filters.state ? { state: filters.state } : {}),
          ...(filters.templateId ? { templateId: filters.templateId } : {}),
          ...(sort?.field === "lastActivityAt" && sort.order
            ? { sort: "lastActivityAt", order: sort.order }
            : {}),
        });
        return { list: res.list, total: res.total };
      } catch (err) {
        message.error(err instanceof Error ? err.message : "加载失败");
        return { list: [], total: 0 };
      }
    },
    [message],
  );

  const filterItems = useMemo(() => sandboxFilters(templates), [templates]);

  const templateNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of templates) map.set(t.id, t.name);
    return map;
  }, [templates]);

  const columns = useMemo(
    () => sandboxColumns(templateNameById),
    [templateNameById],
  );

  const floats = useMemo(
    () => [
      {
        key: "create",
        render: (props: FloatComponentProps<Sandbox>) => (
          <CreateSandboxFloat {...props} onNavigateTemplates={onNavigateTemplates} />
        ),
      },
      {
        key: "detail",
        render: (props: FloatComponentProps<Sandbox>) => (
          <DetailFloat {...props} />
        ),
      },
      {
        key: "logs",
        render: (props: FloatComponentProps<Sandbox>) => <LogsFloat {...props} />,
      },
      {
        key: "desktop",
        render: (props: FloatComponentProps<Sandbox>) => (
          <DesktopFloat {...props} />
        ),
      },
      {
        key: "disk",
        render: (props: FloatComponentProps<Sandbox>) => (
          <DiskFloat {...props} />
        ),
      },
      {
        key: "delete",
        render: (props: FloatComponentProps<Sandbox>) => (
          <DeleteFloat {...props} />
        ),
      },
    ],
    [onNavigateTemplates],
  );

  return (
    <ListPage<Sandbox, SandboxFilters>
      title={
        <Typography.Title level={3} style={{ margin: 0 }}>
          沙箱列表
        </Typography.Title>
      }
      extra={(ctx) => (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => ctx.showFloat("create")}
        >
          新建沙箱
        </Button>
      )}
      filter={{ items: filterItems }}
      middle={
        <>
          <OpenInitialSandboxView
            sandboxId={initialViewSandboxId}
            onConsumed={onConsumedInitialView}
          />
          <AutoRefreshList intervalMs={5000} />
        </>
      }
      table={{ render: () => <SandboxTable columns={columns} /> }}
      request={request}
      float={{ floats }}
      initialValues={{ pageSize: 20 }}
    />
  );
}
