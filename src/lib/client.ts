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

  listSandboxes: () =>
    request<{ sandboxes: Sandbox[] }>("/api/v1/sandboxes"),
  createSandbox: (body: CreateSandboxBody) =>
    request<{ sandbox: Sandbox }>("/api/v1/sandboxes", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getSandbox: (id: string) =>
    request<{ sandbox: Sandbox }>(`/api/v1/sandboxes/${encodeURIComponent(id)}`),
  updateSandbox: (id: string, body: ResourceSpec) =>
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
};
