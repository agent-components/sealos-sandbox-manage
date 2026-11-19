import { parsePageQuery, slicePage } from '../../infrastructure/page';
import { bindBearerToken } from '../auth/bind-request';
import { resolveSandboxRegion } from '../auth/resolve';
import { AuthError } from '../sealos/errors';
import { mapLaunchpadStatus, toSandbox } from '../sealos/map';
import { getPodLogs, listAppPods, execInPod } from '../sealos/kube';
import { getVisibleTemplate, listTemplates } from '../templates/store';
import { createSandboxId } from './id';
import {
  setSandboxIdleConfig,
  touchSandboxActivity,
  withSandboxIdle,
} from './idle';
import { sandboxFromRecord } from './from-record';
import {
  attachRegion,
  launchpadClientFor,
} from './region-fields';
import {
  CreateSandboxSchema,
  DEFAULT_IDLE_CONFIG,
  IdleConfigSchema,
  SandboxStateSchema,
  TagsSchema,
  UpdateSandboxSchema,
  RunSandboxCommandSchema,
} from './schema';
import {
  deleteSandboxRecord,
  listSandboxRecords,
  saveSandboxRecord,
  setSandboxState,
} from './record';
import { assertOwnedBy } from './ownership';
import { setSandboxTags, withSandboxTags } from './tags';
import {
  reconcileSandboxUsage,
  snapshotFromApp,
} from '../billing/meter';
import { getDefaultRegion, getRegion } from '../sealos/regions';
import { resolveSandboxForCommand } from './command';
import { inspectEphemeralDisk } from './ephemeral-disk';
import {
  contentDisposition,
  openSandboxArtifact,
} from './artifact';
import {
  runFsDelete,
  runFsEdit,
  runFsExec,
  runFsGlob,
  runFsGrep,
  runFsRead,
  runFsWrite,
} from './fs-ops';
import type { JsonResponse } from '../errors/response';
import { jsonOk } from '../errors/response';
async function withSandboxExtras(
  owner: string,
  sandbox: ReturnType<typeof toSandbox>,
  regionId: string,
) {
  const [enriched] = await withSandboxIdle(
    owner,
    await withSandboxTags(owner, [attachRegion(sandbox, regionId)]),
  );
  return enriched!;
}

export type ListSandboxesQuery = {
  tag?: string[];
  q?: string;
  keyword?: string;
  templateId?: string;
  state?: string;
  current?: number;
  pageSize?: number | null;
  sort?: 'lastActivityAt';
  order?: 'ascend' | 'descend';
};

function pageFromQuery(query: ListSandboxesQuery) {
  const sp = new URLSearchParams();
  if (query.current != null) sp.set('current', String(query.current));
  if (query.pageSize != null) sp.set('pageSize', String(query.pageSize));
  return parsePageQuery(sp);
}

export async function listSandboxes(username: string, query: ListSandboxesQuery) {
  const tagQuery = query.tag ?? [];
  const keyword = (query.q ?? '')
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  const text = (query.keyword ?? '').trim().toLowerCase();
  const templateId = query.templateId?.trim() || undefined;
  const stateRaw = query.state?.trim() || undefined;
  const state = stateRaw ? SandboxStateSchema.parse(stateRaw) : undefined;
  const page = pageFromQuery(query);
  const tags = tagQuery.length > 0 ? TagsSchema.parse(tagQuery) : [];

  const records = await listSandboxRecords({
    owner: username,
    allowedIds: null,
    tags,
    tagTerms: keyword,
    templateId,
    state,
    keyword: text || undefined,
  });

  const templates = await listTemplates(username);
  const templateById = new Map(templates.map((item) => [item.id, item]));

  const sandboxes = records.map((record) =>
    sandboxFromRecord(record, templateById.get(record.templateId)),
  );

  if (
    query.sort === 'lastActivityAt' &&
    (query.order === 'ascend' || query.order === 'descend')
  ) {
    const dir = query.order === 'ascend' ? 1 : -1;
    sandboxes.sort((a, b) => {
      const at = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const bt = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      return (at - bt) * dir;
    });
  }

  return slicePage(sandboxes, page);
}

export async function createSandbox(username: string, raw: unknown) {
  const input = CreateSandboxSchema.parse(raw);
  const region = input.regionId
    ? await getRegion(input.regionId)
  : await getDefaultRegion();

  const template = await getVisibleTemplate(input.templateId, username);
  if (!template) {
    return {
      status: 400 as const,
      body: { error: `模板「${input.templateId}」不存在，请先创建模板` },
    };
  }

  const idleConfig = IdleConfigSchema.parse({
    autoShutdown: input.autoShutdown ?? template.autoShutdown ?? false,
    idleMinutes: input.idleMinutes ?? template.idleMinutes ?? 5,
  });

  const client = launchpadClientFor(region);
  const id = input.name ?? createSandboxId();
  const app = await client.createAppFromTemplate({
    name: id,
    template,
    resources: {
      cpu: input.cpu,
      memoryGi: input.memoryGi,
      diskGi: input.diskGi,
    },
    env: input.env,
  });
  try {
    await saveSandboxRecord(username, id, template.id, {
      idle: idleConfig,
      state: mapLaunchpadStatus(app.status),
      regionId: region.id,
    });
    await setSandboxTags(username, id, input.tags);
    await reconcileSandboxUsage(snapshotFromApp(app, username));
  } catch (error) {
    await client.deleteApp(id).catch(() => undefined);
    await deleteSandboxRecord(id).catch(() => undefined);
    await reconcileSandboxUsage({ sandboxId: id, end: true }).catch(() => undefined);
    throw error;
  }
  const [sandbox] = await withSandboxIdle(
    username,
    await withSandboxTags(username, [
      attachRegion(toSandbox(app, template.id), region.id),
    ]),
  );
  return { status: 201 as const, body: { sandbox } };
}

export async function getSandbox(username: string, id: string) {
  const region = await resolveSandboxRegion(id);
  const client = launchpadClientFor(region);
  const app = await client.getApp(id);
  const templateId = await assertOwnedBy(app, username);
  await setSandboxState(id, mapLaunchpadStatus(app.status));
  return {
    sandbox: await withSandboxExtras(
      username,
      toSandbox(app, templateId),
      region.id,
    ),
  };
}

export async function updateSandbox(username: string, id: string, raw: unknown) {
  const body = UpdateSandboxSchema.parse(raw);
  const region = await resolveSandboxRegion(id);
  const client = launchpadClientFor(region);
  const existing = await client.getApp(id);
  const templateId = await assertOwnedBy(existing, username);
  const resourcePatch =
    body.cpu !== undefined &&
    body.memoryGi !== undefined &&
    body.diskGi !== undefined
      ? {
          cpu: body.cpu,
          memoryGi: body.memoryGi,
          diskGi: body.diskGi,
        }
      : undefined;

  let app = existing;
  if (body.applyTemplate) {
    if (!templateId) {
      throw new AuthError('该沙箱未关联模板，无法从模板更新', 400);
    }
    const template = await getVisibleTemplate(templateId, username);
    if (!template) {
      throw new AuthError(`模板「${templateId}」不存在或已删除`, 404);
    }
    app = await client.syncAppFromTemplate(id, existing, template, {
      ...(body.env !== undefined ? { env: body.env } : {}),
      ...(resourcePatch
        ? {
            resources: {
              ...resourcePatch,
              replicas: Math.max(1, Math.round(existing.quota?.replicas ?? 1)),
            },
          }
        : {}),
    });
    if (body.autoShutdown === undefined && body.idleMinutes === undefined) {
      await setSandboxIdleConfig(username, id, {
        autoShutdown:
          template.autoShutdown ?? DEFAULT_IDLE_CONFIG.autoShutdown,
        idleMinutes: template.idleMinutes ?? DEFAULT_IDLE_CONFIG.idleMinutes,
      });
    }
  } else if (resourcePatch || body.env !== undefined) {
    app = await client.updateApp(id, {
      ...(resourcePatch ? { resources: resourcePatch } : {}),
      ...(body.env !== undefined ? { env: body.env } : {}),
    });
  }

  if (body.tags !== undefined) {
    await setSandboxTags(username, id, body.tags);
  }
  if (body.autoShutdown !== undefined || body.idleMinutes !== undefined) {
    const current = await withSandboxExtras(
      username,
      toSandbox(existing, templateId),
      region.id,
    );
    await setSandboxIdleConfig(username, id, {
      autoShutdown:
        body.autoShutdown ??
        current.autoShutdown ??
        DEFAULT_IDLE_CONFIG.autoShutdown,
      idleMinutes:
        body.idleMinutes ??
        current.idleMinutes ??
        DEFAULT_IDLE_CONFIG.idleMinutes,
    });
  }
  await setSandboxState(id, mapLaunchpadStatus(app.status));
  await reconcileSandboxUsage(snapshotFromApp(app, username));
  return {
    sandbox: await withSandboxExtras(
      username,
      toSandbox(app, templateId),
      region.id,
    ),
  };
}

export async function deleteSandbox(username: string, id: string) {
  const region = await resolveSandboxRegion(id);
  const client = launchpadClientFor(region);
  const existing = await client.getApp(id);
  await assertOwnedBy(existing, username);
  await client.deleteApp(id);
  await deleteSandboxRecord(id);
  await reconcileSandboxUsage({ sandboxId: id, end: true });
  return { ok: true as const };
}

export async function stopSandbox(username: string, id: string) {
  const region = await resolveSandboxRegion(id);
  const client = launchpadClientFor(region);
  const existing = await client.getApp(id);
  const templateId = await assertOwnedBy(existing, username);
  await client.pauseApp(id);
  const app = await client.getApp(id);
  await setSandboxState(id, mapLaunchpadStatus(app.status));
  await reconcileSandboxUsage(snapshotFromApp(app, username));
  const [sandbox] = await withSandboxIdle(
    username,
    await withSandboxTags(username, [
      attachRegion(toSandbox(app, templateId), region.id),
    ]),
  );
  return { sandbox };
}

export async function resumeSandbox(username: string, id: string) {
  const region = await resolveSandboxRegion(id);
  const client = launchpadClientFor(region);
  const existing = await client.getApp(id);
  const templateId = await assertOwnedBy(existing, username);
  await client.startApp(id);
  await touchSandboxActivity(id);
  const app = await client.getApp(id);
  await setSandboxState(id, mapLaunchpadStatus(app.status));
  await reconcileSandboxUsage(snapshotFromApp(app, username));
  const [sandbox] = await withSandboxIdle(
    username,
    await withSandboxTags(username, [
      attachRegion(toSandbox(app, templateId), region.id),
    ]),
  );
  return { sandbox };
}

export async function syncSandboxTemplate(username: string, id: string) {
  const region = await resolveSandboxRegion(id);
  const client = launchpadClientFor(region);
  const existing = await client.getApp(id);
  const templateId = await assertOwnedBy(existing, username);

  if (!templateId) {
    throw new AuthError('该沙箱未关联模板，无法从模板更新', 400);
  }

  const template = await getVisibleTemplate(templateId, username);
  if (!template) {
    throw new AuthError(`模板「${templateId}」不存在或已删除`, 404);
  }

  const app = await client.syncAppFromTemplate(id, existing, template);
  await setSandboxState(id, mapLaunchpadStatus(app.status));
  await reconcileSandboxUsage(snapshotFromApp(app, username));

  await setSandboxIdleConfig(username, id, {
    autoShutdown: template.autoShutdown ?? DEFAULT_IDLE_CONFIG.autoShutdown,
    idleMinutes: template.idleMinutes ?? DEFAULT_IDLE_CONFIG.idleMinutes,
  });

  const [sandbox] = await withSandboxIdle(
    username,
    await withSandboxTags(username, [
      attachRegion(toSandbox(app, templateId), region.id),
    ]),
  );
  return { sandbox };
}

export async function runSandboxCommand(
  _username: string,
  token: string | null,
  id: string,
  raw: unknown,
  signal?: AbortSignal,
) {
  const body = RunSandboxCommandSchema.parse(raw);
  bindBearerToken(token);
  const target = await resolveSandboxForCommand(id, signal);
  const result = await execInPod(target.kubeconfig, {
    pod: target.pod,
    container: target.container,
    command: ['/bin/sh', '-c', body.command],
  });
  return {
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function fsRead(
  _username: string,
  token: string | null,
  id: string,
  raw: unknown,
) {
  bindBearerToken(token);
  return runFsRead(id, raw);
}

export async function fsWrite(
  _username: string,
  token: string | null,
  id: string,
  raw: unknown,
) {
  bindBearerToken(token);
  return runFsWrite(id, raw);
}

export async function fsEdit(
  _username: string,
  token: string | null,
  id: string,
  raw: unknown,
) {
  bindBearerToken(token);
  return runFsEdit(id, raw);
}

export async function fsDelete(
  _username: string,
  token: string | null,
  id: string,
  raw: unknown,
) {
  bindBearerToken(token);
  return runFsDelete(id, raw);
}

export async function fsGrep(
  _username: string,
  token: string | null,
  id: string,
  raw: unknown,
) {
  bindBearerToken(token);
  return runFsGrep(id, raw);
}

export async function fsGlob(
  _username: string,
  token: string | null,
  id: string,
  raw: unknown,
) {
  bindBearerToken(token);
  return runFsGlob(id, raw);
}

export async function fsExec(
  _username: string,
  token: string | null,
  id: string,
  raw: unknown,
) {
  bindBearerToken(token);
  return runFsExec(id, raw);
}

export async function getSandboxLogs(username: string, id: string, query: {
  pod?: string;
  tailLines?: number;
  previous?: boolean;
}) {
  const region = await resolveSandboxRegion(id);
  const kubeconfig = region.kubeconfig;
  const client = launchpadClientFor(region);
  const app = await client.getApp(id);
  await assertOwnedBy(app, username);

  const pods = await listAppPods(kubeconfig, id);
  if (!pods.length) {
    return {
      pods: [],
      pod: null,
      container: null,
      logs: '',
      message: '暂无 Pod，应用可能仍在创建或已关机',
    };
  }

  const tailLines = query.tailLines ?? 500;
  const previous = query.previous ?? false;

  const selected =
    pods.find((p) => p.name === query.pod) ??
    pods.find((p) => p.phase === 'Running') ??
    pods[0]!;

  try {
    const { logs } = await getPodLogs(kubeconfig, {
      pod: selected.name,
      container: selected.container,
      tailLines: Math.min(5000, Math.max(50, tailLines)),
      previous,
    });
    return {
      pods,
      pod: selected.name,
      container: selected.container,
      logs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取日志失败';
    return {
      pods,
      pod: selected.name,
      container: selected.container,
      logs: '',
      message,
    };
  }
}

export async function getEphemeralDisk(
  _username: string,
  token: string | null,
  id: string,
) {
  bindBearerToken(token);
  return inspectEphemeralDisk(id, new Request('http://boat.local/'));
}

export type ArtifactOpenResult =
  | { kind: 'json'; response: JsonResponse }
  | { kind: 'stream'; response: Response };

export async function getSandboxArtifact(
  _username: string,
  token: string | null,
  id: string,
  path: string,
  signal?: AbortSignal,
): Promise<ArtifactOpenResult> {
  bindBearerToken(token);
  const artifact = await openSandboxArtifact(id, path, signal);
  if (artifact.kind === 'image') {
    const body = {
      path: artifact.path,
      mediaType: artifact.mediaType,
      encoding: 'base64' as const,
      data: artifact.base64,
    };
    return {
      kind: 'json',
      response: jsonOk(body, {
        headers: {
          'X-Artifact-Kind': 'image',
          'Cache-Control': 'no-store',
        },
      }),
    };
  }

  const headers = new Headers({
    'Content-Type': artifact.mediaType,
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
    'X-Artifact-Kind': artifact.kind,
  });
  if (artifact.kind === 'binary') {
    headers.set('Content-Disposition', contentDisposition(artifact.filename));
  }
  return {
    kind: 'stream',
    response: new Response(artifact.stream, { headers }),
  };
}