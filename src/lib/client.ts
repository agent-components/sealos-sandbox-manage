import type { ApiKey } from "@/lib/apikey/schema";
import type { Sandbox } from "@/lib/sandbox/schema";
import type { ResourceSpec } from "@/lib/sealos/resources";
import type { Template } from "@/lib/template/schema";

export type ApiError = { error: string; details?: unknown };

export type SandboxUser = { username: string; displayName: string };

export type CreateSandboxBody = {
  templateId: string;
  name?: string;
  cpu?: number;
  memoryGi?: number;
  diskGi?: number;
  env?: { name: string; value: string }[];
  tags?: string[];
  autoShutdown?: boolean;
  idleMinutes?: number;
};

export type UpdateSandboxBody = Partial<ResourceSpec> & {
  tags?: string[];
  autoShutdown?: boolean;
  idleMinutes?: number;
};

export type PageResult<T> = {
  list: T[];
  total: number;
};

export type PageQuery = {
  /** 页码，从 1 开始 */
  current?: number;
  /** 每页条数。省略时接口返回全部匹配结果（调用日志除外） */
  pageSize?: number;
};

export type ListSandboxesQuery = PageQuery & {
  /** 精确标签，需同时包含 */
  tag?: string[];
  /** 标签关键词，空格或逗号分隔，每个词都要能在某个标签中找到 */
  q?: string;
  /** 匹配沙箱 ID、镜像或模板名称 */
  keyword?: string;
  state?: Sandbox["state"];
  templateId?: string;
};

function appendPage(q: URLSearchParams, query?: PageQuery) {
  if (query?.current) q.set("current", String(query.current));
  if (query?.pageSize) q.set("pageSize", String(query.pageSize));
}

export type CreateTemplateBody = Omit<
  Template,
  "id" | "createdAt" | "updatedAt"
> & { id?: string };

export type UpdateTemplateBody = Partial<
  Omit<CreateTemplateBody, "id">
>;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data as ApiError;
    throw new Error(err.error || `请求失败（${res.status}）`);
  }
  return data as T;
}

export const sandboxClient = {
  me: () =>
    request<{ authenticated: boolean; user: SandboxUser | null }>("/api/auth/me"),
  login: (username: string, password: string) =>
    request<{ user: SandboxUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  listSandboxes: (query?: ListSandboxesQuery) => {
    const q = new URLSearchParams();
    for (const tag of query?.tag ?? []) q.append("tag", tag);
    if (query?.q?.trim()) q.set("q", query.q.trim());
    if (query?.keyword?.trim()) q.set("keyword", query.keyword.trim());
    if (query?.state) q.set("state", query.state);
    if (query?.templateId) q.set("templateId", query.templateId);
    appendPage(q, query);
    const qs = q.toString();
    return request<PageResult<Sandbox>>(
      `/api/v1/sandboxes${qs ? `?${qs}` : ""}`,
    );
  },
  createSandbox: (body: CreateSandboxBody) =>
    request<{ sandbox: Sandbox }>("/api/v1/sandboxes", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getSandbox: (id: string) =>
    request<{ sandbox: Sandbox }>(`/api/v1/sandboxes/${encodeURIComponent(id)}`),
  updateSandbox: (id: string, body: UpdateSandboxBody) =>
    request<{ sandbox: Sandbox }>(`/api/v1/sandboxes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteSandbox: (id: string) =>
    request<{ ok: true }>(`/api/v1/sandboxes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  stopSandbox: (id: string) =>
    request<{ sandbox: Sandbox }>(
      `/api/v1/sandboxes/${encodeURIComponent(id)}/stop`,
      { method: "POST" },
    ),
  resumeSandbox: (id: string) =>
    request<{ sandbox: Sandbox }>(
      `/api/v1/sandboxes/${encodeURIComponent(id)}/resume`,
      { method: "POST" },
    ),
  runSandboxCommand: (id: string, command: string) =>
    request<{ ok: boolean; exitCode: number; stdout: string; stderr: string }>(
      `/api/v1/sandboxes/${encodeURIComponent(id)}/commands`,
      { method: "POST", body: JSON.stringify({ command }) },
    ),
  getSandboxLogs: (
    id: string,
    opts?: { pod?: string; tailLines?: number; previous?: boolean },
  ) => {
    const q = new URLSearchParams();
    if (opts?.pod) q.set("pod", opts.pod);
    if (opts?.tailLines) q.set("tailLines", String(opts.tailLines));
    if (opts?.previous) q.set("previous", "true");
    const qs = q.toString();
    return request<{
      pods: { name: string; phase: string; container: string; ready: boolean }[];
      pod: string | null;
      container: string | null;
      logs: string;
      message?: string;
    }>(
      `/api/v1/sandboxes/${encodeURIComponent(id)}/logs${qs ? `?${qs}` : ""}`,
    );
  },

  listTemplates: (query?: PageQuery & { q?: string }) => {
    const q = new URLSearchParams();
    if (query?.q?.trim()) q.set("q", query.q.trim());
    appendPage(q, query);
    const qs = q.toString();
    return request<PageResult<Template>>(
      `/api/v1/templates${qs ? `?${qs}` : ""}`,
    );
  },
  createTemplate: (body: CreateTemplateBody) =>
    request<{ template: Template }>("/api/v1/templates", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateTemplate: (id: string, body: UpdateTemplateBody) =>
    request<{ template: Template }>(
      `/api/v1/templates/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deleteTemplate: (id: string) =>
    request<{ ok: true }>(`/api/v1/templates/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  listMcpLogs: (query?: PageQuery & {
    tool?: string;
    apiKeyId?: string;
    from?: string;
    to?: string;
  }) => {
    const q = new URLSearchParams();
    if (query?.tool) q.set("tool", query.tool);
    appendPage(q, query);
    if (query?.apiKeyId) q.set("apiKeyId", query.apiKeyId);
    if (query?.from) q.set("from", query.from);
    if (query?.to) q.set("to", query.to);
    const qs = q.toString();
    return request<
      PageResult<{
        id: string;
        username?: string;
        apiKeyId?: string | null;
        apiKeyName?: string | null;
        channel?: "mcp" | "rest";
        tool: string;
        method: string;
        path: string;
        arguments: Record<string, unknown>;
        status: number;
        ok: boolean;
        resultKey: string | null;
        resultError: string | null;
        startedAt: string;
        completedAt: string;
        durationMs: number;
        createdAt: string;
      }>
    >(`/api/v1/mcp-logs${qs ? `?${qs}` : ""}`);
  },
  getMcpLog: (id: string) =>
    request<{
      log: {
        id: string;
        username?: string;
        apiKeyId?: string | null;
        apiKeyName?: string | null;
        channel?: "mcp" | "rest";
        tool: string;
        method: string;
        path: string;
        arguments: Record<string, unknown>;
        status: number;
        ok: boolean;
        resultKey: string | null;
        resultError: string | null;
        startedAt: string;
        completedAt: string;
        durationMs: number;
        createdAt: string;
      };
      result: unknown;
      resultLoadError: string | null;
    }>(`/api/v1/mcp-logs/${encodeURIComponent(id)}`),

  listApiKeys: (query?: PageQuery & { q?: string }) => {
    const q = new URLSearchParams();
    if (query?.q?.trim()) q.set("q", query.q.trim());
    appendPage(q, query);
    const qs = q.toString();
    return request<PageResult<ApiKey>>(
      `/api/v1/apikeys${qs ? `?${qs}` : ""}`,
    );
  },
  createApiKey: (body: { name: string; sandboxIds?: string[] }) =>
    request<{ apiKey: ApiKey }>("/api/v1/apikeys", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateApiKey: (
    id: string,
    body: { name?: string; sandboxIds?: string[] },
  ) =>
    request<{ apiKey: ApiKey }>(`/api/v1/apikeys/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getApiKeySecret: (id: string) =>
    request<{ key: string }>(
      `/api/v1/apikeys/${encodeURIComponent(id)}/secret`,
    ),
  deleteApiKey: (id: string) =>
    request<{ ok: true }>(`/api/v1/apikeys/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
