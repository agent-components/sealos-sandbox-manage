import type { IncomingMessage, ServerResponse } from 'node:http';
import { jsonError, sendJson } from '../errors/response';
import { loginWithHarnessSso } from './harness-sso';

const maxBodyBytes = 64_000;

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new Error('请求体过大');
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  return JSON.parse(text) as unknown;
}

/**
 * 宿主主动调组件 OpenAPI 前换会话：
 * POST /api/auth/sso  { "code": "<一次性票据>" }
 * → { token, user: { id, account, displayName, role } }
 */
export async function handleAuthSsoHttp(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  if (path !== '/api/auth/sso') return false;

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (req.method !== 'POST') {
    sendJson(res, { status: 405, body: { error: 'method_not_allowed' } });
    return true;
  }

  try {
    const body = await readJsonBody(req);
    const code =
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      typeof (body as { code: unknown }).code === 'string'
        ? (body as { code: string }).code
        : '';

    const result = await loginWithHarnessSso(code);
    sendJson(res, {
      status: 200,
      body: {
        token: result.token,
        user: result.user,
      },
    });
  } catch (error) {
    sendJson(res, jsonError(error));
  }

  return true;
}
