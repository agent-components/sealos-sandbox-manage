import type { ApiKey } from "@/lib/apikey/schema";
import type { Sandbox } from "@/lib/sandbox/schema";
import type { ResourceSpec } from "@/lib/sealos/resources";
import type { Template } from "@/lib/template/schema";

export type ApiError = { error: string; details?: unknown };

export type BoatUser = { username: string };

export type CreateSandboxBody = {
  templateId: string;
  name?: string;
  cpu?: number;
  memoryGi?: number;
  diskGi?: number;
  env?: { name: string; value: string }[];
  tags?: string[];
};

export type UpdateSandboxBody = Partial<ResourceSpec> & {
  tags?: string[];
};

export type ListSandboxesQuery = {
  /** 精确标签，需同时包含 */
  tag?: string[];
  /** 标签关键词，空格或逗号分隔，每个词都要能在某个标签中找到 */
  q?: string;
};

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

export const boatClient = {
  me: () =>
    request<{ authenticated: boolean; user: BoatUser | null }>("/api/auth/me"),
  login: (username: string, password: string) =>
    request<{ user: BoatUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  listSandboxes: (query?: ListSandboxesQuery) => {
    const q = new URLSearchParams();
    for (const tag of query?.tag ?? []) q.append("tag", tag);
    if (query?.q?.trim()) q.set("q", query.q.trim());
    const qs = q.toString();
    return request<{ sandboxes: Sandbox[] }>(
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

  listTemplates: () =>
    request<{ templates: Template[] }>("/api/v1/templates"),
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

  listApiKeys: () => request<{ apiKeys: ApiKey[] }>("/api/v1/apikeys"),
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
  deleteApiKey: (id: string) =>
    request<{ ok: true }>(`/api/v1/apikeys/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
