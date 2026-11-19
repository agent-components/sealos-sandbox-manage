import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { findUserByToken, type PublicUser } from '../../lib/auth/users';
import { jsonError, jsonOk, sendJson } from '../../lib/api/response';
import { recordCall } from '../../lib/logs/audit';
import { openApiDocument } from '../../lib/openapi/document';
import { parsePageQuery } from '../../lib/api/page';
import { AuthError } from '../../lib/sealos/errors';
import { bindBearerToken } from '../auth/bind-request';
import { readBearerToken } from '../auth/token';
import * as billingService from '../billing/billing.service';
import * as sandboxService from '../sandboxes/sandbox.service';

const maxBodyBytes = 2_000_000;

type RouteArgs = Record<string, unknown>;

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new AuthError('请求体过大', 413);
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  return JSON.parse(text) as unknown;
}

async function requireOpenApiUser(
  req: IncomingMessage,
): Promise<{ user: PublicUser; token: string }> {
  const token = readBearerToken(req);
  if (!token) {
    throw new AuthError('请先登录');
  }
  const user = await findUserByToken(token);
  if (!user) {
    throw new AuthError('请先登录');
  }
  bindBearerToken(token);
  return { user, token };
}

async function runAudited(
  req: IncomingMessage,
  opts: {
    operation: string;
    method: string;
    path: string;
    arguments: RouteArgs;
    run: (
      user: PublicUser,
      token: string,
    ) => Promise<{ status: number; body: unknown; stream?: Response }>;
  },
): Promise<{ status: number; body?: unknown; stream?: Response }> {
  const started = Date.now();
  try {
    const { user, token } = await requireOpenApiUser(req);
    const outcome = await opts.run(user, token);
    await recordCall({
      operation: opts.operation,
      method: opts.method,
      path: opts.path,
      arguments: opts.arguments,
      status: outcome.status,
      result: outcome.stream ? null : outcome.body,
      username: user.username,
      startedAt: started,
    });
    return outcome;
  } catch (error) {
    const mapped = jsonError(error);
    let username: string | undefined;
    try {
      const token = readBearerToken(req);
      if (token) {
        const user = await findUserByToken(token);
        username = user?.username;
      }
    } catch {
      // ignore
    }
    await recordCall({
      operation: opts.operation,
      method: opts.method,
      path: opts.path,
      arguments: opts.arguments,
      status: mapped.status,
      result: mapped.body,
      username,
      startedAt: started,
    });
    return { status: mapped.status, body: mapped.body };
  }
}

async function pipeWebStream(res: ServerResponse, response: Response) {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);
  if (!response.body) {
    res.end();
    return;
  }
  const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
  await pipeline(nodeStream, res);
}

function sandboxIdFromPath(segments: string[]): string | null {
  if (segments[0] !== 'sandboxes' || !segments[1]) return null;
  return segments[1];
}

function parseListQuery(url: URL) {
  const tag = url.searchParams
    .getAll('tag')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  const page = parsePageQuery(url.searchParams);
  return {
    tag,
    q: url.searchParams.get('q') ?? undefined,
    keyword: url.searchParams.get('keyword') ?? undefined,
    templateId: url.searchParams.get('templateId') ?? undefined,
    state: url.searchParams.get('state') ?? undefined,
    current: page.current,
    pageSize: page.pageSize,
  };
}

async function dispatchOpenApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  const method = req.method ?? 'GET';
  const segments = pathname.replace(/^\/+/, '').split('/').filter(Boolean);

  if (segments[0] === 'billing' && method === 'GET') {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const args = {
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
    };
    const outcome = await runAudited(req, {
      operation: 'getBilling',
      method: 'GET',
      path: '/billing',
      arguments: args,
      run: async (user) => {
        const result = await billingService.getBillingReportForUser(user.username, args);
        if (!result.ok) {
          return { status: result.status, body: { error: result.error } };
        }
        return { status: 200, body: result.report };
      },
    });
    sendJson(res, jsonOk(outcome.body, { status: outcome.status }));
    return true;
  }

  if (segments[0] === 'sandboxes' && segments.length === 1) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (method === 'GET') {
      const args = parseListQuery(url);
      const outcome = await runAudited(req, {
        operation: 'listSandboxes',
        method: 'GET',
        path: '/sandboxes',
        arguments: args,
        run: async (user) => {
          const list = await sandboxService.listSandboxes(user.username, args);
          return { status: 200, body: list };
        },
      });
      sendJson(res, jsonOk(outcome.body, { status: outcome.status }));
      return true;
    }
    if (method === 'POST') {
      const raw = await readJsonBody(req);
      const args =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as RouteArgs)
          : {};
      const outcome = await runAudited(req, {
        operation: 'createSandbox',
        method: 'POST',
        path: '/sandboxes',
        arguments: args,
        run: async (user) => {
          const created = await sandboxService.createSandbox(user.username, raw);
          return { status: created.status, body: created.body };
        },
      });
      sendJson(res, jsonOk(outcome.body, { status: outcome.status }));
      return true;
    }
  }

  const id = sandboxIdFromPath(segments);
  if (id && segments.length === 2) {
    if (method === 'GET') {
      const outcome = await runAudited(req, {
        operation: 'getSandbox',
        method: 'GET',
        path: '/sandboxes/{id}',
        arguments: { id },
        run: async (user) => {
          const body = await sandboxService.getSandbox(user.username, id);
          return { status: 200, body };
        },
      });
      sendJson(res, jsonOk(outcome.body, { status: outcome.status }));
      return true;
    }
    if (method === 'DELETE') {
      const outcome = await runAudited(req, {
        operation: 'deleteSandbox',
        method: 'DELETE',
        path: '/sandboxes/{id}',
        arguments: { id },
        run: async (user) => {
          const body = await sandboxService.deleteSandbox(user.username, id);
          return { status: 200, body };
        },
      });
      sendJson(res, jsonOk(outcome.body, { status: outcome.status }));
      return true;
    }
  }

  const action = segments[2];
  if (id && action === 'stop' && method === 'POST') {
    const outcome = await runAudited(req, {
      operation: 'stopSandbox',
      method: 'POST',
      path: '/sandboxes/{id}/stop',
      arguments: { id },
      run: async (user) => {
        const body = await sandboxService.stopSandbox(user.username, id);
        return { status: 200, body };
      },
    });
    sendJson(res, jsonOk(outcome.body, { status: outcome.status }));
    return true;
  }

  if (id && action === 'resume' && method === 'POST') {
    const outcome = await runAudited(req, {
      operation: 'resumeSandbox',
      method: 'POST',
      path: '/sandboxes/{id}/resume',
      arguments: { id },
      run: async (user) => {
        const body = await sandboxService.resumeSandbox(user.username, id);
        return { status: 200, body };
      },
    });
    sendJson(res, jsonOk(outcome.body, { status: outcome.status }));
    return true;
  }

  if (id && action === 'sync-template' && method === 'POST') {
    const outcome = await runAudited(req, {
      operation: 'syncSandboxFromTemplate',
      method: 'POST',
      path: '/sandboxes/{id}/sync-template',
      arguments: { id },
      run: async (user) => {
        const body = await sandboxService.syncSandboxTemplate(user.username, id);
        return { status: 200, body };
      },
    });
    sendJson(res, jsonOk(outcome.body, { status: outcome.status }));
    return true;
  }

  if (id && action === 'commands' && method === 'POST') {
    const raw = await readJsonBody(req);
    const args: RouteArgs = { id };
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'command' in raw) {
      args.command = (raw as { command: unknown }).command;
    }
    const outcome = await runAudited(req, {
      operation: 'runSandboxCommand',
      method: 'POST',
      path: '/sandboxes/{id}/commands',
      arguments: args,
      run: async (user, token) => {
        const body = await sandboxService.runSandboxCommand(
          user.username,
          token,
          id,
          raw,
        );
        return { status: 200, body };
      },
    });
    sendJson(res, jsonOk(outcome.body, { status: outcome.status }));
    return true;
  }

  if (id && action === 'artifacts' && method === 'GET') {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.searchParams.get('path') ?? '';
    const outcome = await runAudited(req, {
      operation: 'getSandboxArtifact',
      method: 'GET',
      path: '/sandboxes/{id}/artifacts',
      arguments: { id, path },
      run: async (user, token) => {
        const opened = await sandboxService.getSandboxArtifact(
          user.username,
          token,
          id,
          path,
        );
        if (opened.kind === 'stream') {
          return { status: opened.response.status, body: undefined, stream: opened.response };
        }
        return {
          status: opened.response.status,
          body: opened.response.body as unknown,
        };
      },
    });
    if (outcome.stream) {
      await pipeWebStream(res, outcome.stream);
      return true;
    }
    sendJson(res, jsonOk(outcome.body, { status: outcome.status }));
    return true;
  }

  return false;
}

export async function handleOpenApiHttp(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const rawPath = (req.url ?? '/').split('?')[0] ?? '/';

  if (rawPath === '/api/openapi.json' && req.method === 'GET') {
    sendJson(res, jsonOk(openApiDocument()));
    return true;
  }

  if (rawPath === '/api/openapi' || rawPath.startsWith('/api/openapi/')) {
    const subPath = rawPath === '/api/openapi' ? '/' : rawPath.slice('/api/openapi'.length);
    const handled = await dispatchOpenApi(req, res, subPath);
    if (!handled) {
      sendJson(res, jsonOk({ error: '未找到接口' }, { status: 404 }));
    }
    return true;
  }

  return false;
}