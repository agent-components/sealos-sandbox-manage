"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Typography } from "antd";
import {
  ListPage,
  useListPageContext,
  type FloatComponentProps,
} from "listpage-components/ListPage";
import { AutoRefreshList } from "@/components/list-page";
import { SandboxDetailModal } from "@/components/SandboxDetailModal";
import { SandboxLogsModal } from "@/components/SandboxLogsModal";
import { sandboxClient } from "@/lib/client";
import type { Sandbox } from "@/lib/sandbox/schema";
import type { Template } from "@/lib/template/schema";
import { sandboxColumns } from "./columns";
import { CreateSandboxModal } from "./create";
import { DeleteSandboxModal } from "./delete";
import { sandboxFilters, type SandboxFilters } from "./filters";
import { SandboxTable } from "./table";

function CreateSandboxFloat({ onClose }: FloatComponentProps<Sandbox>) {
  const { refreshTable } = useListPageContext<Sandbox, SandboxFilters>();
  return (
    <CreateSandboxModal
      open
      onClose={() => onClose()}
      onSaved={refreshTable}
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

function OpenDetailFromQuery() {
  const ctx = useListPageContext<Sandbox, SandboxFilters>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const view = searchParams.get("view");
    if (!view) {
      handled.current = null;
      return;
    }
    if (handled.current === view) return;
    handled.current = view;
    ctx.showFloat("detail", { id: view } as Sandbox);
    router.replace("/sandboxes");
  }, [ctx, router, searchParams]);

  return null;
}

export default function SandboxesPage() {
  const { message } = App.useApp();
  const [templates, setTemplates] = useState<Template[]>([]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await sandboxClient.listTemplates();
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
    ) => {
      try {
        const res = await sandboxClient.listSandboxes({
          current: page.current,
          pageSize: page.pageSize,
          ...(filters.q?.trim() ? { keyword: filters.q.trim() } : {}),
          ...(filters.tag?.trim() ? { q: filters.tag.trim() } : {}),
          ...(filters.state ? { state: filters.state } : {}),
          ...(filters.templateId ? { templateId: filters.templateId } : {}),
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
          <CreateSandboxFloat {...props} />
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
        key: "delete",
        render: (props: FloatComponentProps<Sandbox>) => (
          <DeleteFloat {...props} />
        ),
      },
    ],
    [],
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
          <OpenDetailFromQuery />
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
