"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Button, Typography } from "antd";
import {
  ListPage,
  useListPageContext,
  type FloatComponentProps,
} from "listpage-components/ListPage";
import { AutoRefreshList, paginate } from "@/components/list-page";
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

function createdAtMs(value?: string) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}

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
      setTemplates(res.templates);
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
        const res = await sandboxClient.listSandboxes();
        let list = res.sandboxes;
        const keyword = filters.q?.trim().toLowerCase();
        if (keyword) {
          list = list.filter((sandbox) => {
            const templateName = templates
              .find((item) => item.id === sandbox.templateId)
              ?.name?.toLowerCase();
            return (
              sandbox.id.toLowerCase().includes(keyword) ||
              (sandbox.image ?? "").toLowerCase().includes(keyword) ||
              (templateName ?? "").includes(keyword)
            );
          });
        }
        const terms = (filters.tag ?? "")
          .split(/[\s,]+/)
          .map((term) => term.trim().toLowerCase())
          .filter(Boolean);
        if (terms.length > 0) {
          list = list.filter((sandbox) =>
            terms.every((term) =>
              sandbox.tags.some((tag) => tag.toLowerCase().includes(term)),
            ),
          );
        }
        if (filters.state) {
          list = list.filter((sandbox) => sandbox.state === filters.state);
        }
        if (filters.templateId) {
          list = list.filter(
            (sandbox) => sandbox.templateId === filters.templateId,
          );
        }
        list = [...list].sort(
          (a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt),
        );
        return paginate(list, page.current, page.pageSize);
      } catch (err) {
        message.error(err instanceof Error ? err.message : "加载失败");
        return { list: [], total: 0 };
      }
    },
    [message, templates],
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
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            沙箱列表
          </Typography.Title>
          <Typography.Text type="secondary">
            基于模板创建 · 状态每 5 秒刷新
          </Typography.Text>
        </div>
      }
      extra={(ctx) => (
        <Button type="primary" onClick={() => ctx.showFloat("create")}>
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
