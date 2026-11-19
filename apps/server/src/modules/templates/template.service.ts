import { AuthError } from '../../lib/sealos/errors';
import { createTemplateId } from '../../lib/template/id';
import { CreateTemplateSchema, UpdateTemplateSchema } from '../../lib/template/schema';
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  getVisibleTemplate,
  listTemplatesPage,
  publishTemplate,
  updateTemplate,
} from '../../lib/template/store';

function assertOwner(template: { owner?: string }, username: string) {
  if (template.owner !== username) {
    throw new AuthError('只有创建人可以修改模板', 403);
  }
}

export async function listTemplates(
  username: string,
  opts: {
    q?: string;
    isPublic?: boolean;
    current?: number;
    pageSize?: number;
  },
) {
  return listTemplatesPage({
    viewer: username,
    q: opts.q,
    isPublic: opts.isPublic,
    current: opts.current,
    pageSize: opts.pageSize,
  });
}

export async function getTemplateById(username: string, id: string) {
  const template = await getVisibleTemplate(id, username, { redact: true });
  if (!template) {
    return { error: '模板不存在', status: 404 as const };
  }
  return { template, status: 200 as const };
}

export async function createTemplateForUser(username: string, raw: unknown) {
  const input = CreateTemplateSchema.parse(raw);

  let id = input.id?.trim() || createTemplateId();
  for (let i = 0; i < 5; i++) {
    const existing = await getTemplate(id);
    if (!existing) break;
    if (input.id?.trim()) {
      return { error: `模板 ID「${id}」已存在`, status: 409 as const };
    }
    id = createTemplateId();
  }
  if (await getTemplate(id)) {
    return { error: '无法生成唯一模板 ID，请重试', status: 500 as const };
  }

  const template = await createTemplate({
    ...input,
    id,
    owner: username,
    isPublic: input.isPublic ?? false,
  });
  return { template, status: 201 as const };
}

export async function updateTemplateForUser(
  username: string,
  id: string,
  raw: unknown,
) {
  const current = await getTemplate(id);
  if (!current) {
    return { error: '模板不存在', status: 404 as const };
  }
  assertOwner(current, username);
  const patch = UpdateTemplateSchema.parse(raw);
  const template = await updateTemplate(id, patch);
  if (!template) {
    return { error: '模板不存在', status: 404 as const };
  }
  return { template, status: 200 as const };
}

export async function deleteTemplateForUser(username: string, id: string) {
  const current = await getTemplate(id);
  if (!current) {
    return { error: '模板不存在', status: 404 as const };
  }
  assertOwner(current, username);
  const ok = await deleteTemplate(id);
  if (!ok) {
    return { error: '模板不存在', status: 404 as const };
  }
  return { ok: true as const, status: 200 as const };
}

export async function publishTemplateForUser(username: string, id: string) {
  const template = await publishTemplate(id, username);
  return { template, status: 201 as const };
}