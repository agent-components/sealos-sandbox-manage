import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isMcpEnabled } from '../../infrastructure/env';
import { PRODUCT_NAME } from '../../infrastructure/product';
import { harnessTools, type HarnessTool } from '../harness/tools.http';
import { handleOpenApiHttp } from '../openapi/openapi.http';

const defaultProtocol = '2025-06-18';
const supportedProtocols = new Set(['2024-11-05', '2025-03-26', defaultProtocol]);
const maxBodyBytes = 1_000_000;

type RpcId = string | number | null;

type RpcRequest = {
  id?: RpcId;
  method: string;
  params?: unknown;
};

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
  'access-control-allow-headers':
    'content-type, accept, authorization, mcp-protocol-version, mcp-session-id, x-sandbox-id',
  'access-control-expose-headers': 'mcp-session-id',
};

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...corsHeaders,
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendSse(res: ServerResponse, body: unknown) {
  const payload = `event: message\ndata: ${JSON.stringify(body)}\n\n`;
  res.writeHead(200, {
    ...corsHeaders,
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendEmpty(res: ServerResponse, status: number) {
  res.writeHead(status, corsHeaders);
  res.end();
}

function wantsEventStream(req: IncomingMessage) {
  const accept = req.headers.accept ?? '';
  if (!accept.trim()) return false;
  const acceptsJson = accept.includes('application/json') || accept.includes('*/*');
  return accept.includes('text/event-stream') && !acceptsJson;
}

function rpcError(id: RpcId | undefined, code: number, message: string) {
  return {
    jsonrpc: '2.0' as const,
    id: id ?? null,
    error: { code, message },
  };
}

function rpcResult(id: RpcId, result: unknown) {
  return {
    jsonrpc: '2.0' as const,
    id,
    result,
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name.toLowerCase()];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return value || undefined;
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error('body_too_large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

function parseRequest(value: unknown): RpcRequest | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  if (!('jsonrpc' in value) || value.jsonrpc !== '2.0') return undefined;
  if (!('method' in value) || typeof value.method !== 'string' || !value.method) return undefined;
  if ('id' in value && value.id !== null && typeof value.id !== 'string' && typeof value.id !== 'number') {
    return undefined;
  }
  const request: RpcRequest = { method: value.method };
  if ('id' in value && (value.id === null || typeof value.id === 'string' || typeof value.id === 'number')) {
    request.id = value.id;
  }
  if ('params' in value) request.params = value.params;
  return request;
}

function protocolFrom(params: unknown) {
  const version = asObject(params)?.protocolVersion;
  return typeof version === 'string' && supportedProtocols.has(version) ? version : defaultProtocol;
}

function mcpToolList() {
  return harnessTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
  }));
}

function toolResult(text: string, isError = false) {
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  };
}

function toQuery(args: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) params.append(key, String(item));
      }
      continue;
    }
    if (typeof value === 'object') {
      params.set(key, JSON.stringify(value));
      continue;
    }
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function fakeRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): IncomingMessage {
  const stream = Readable.from(body ? [Buffer.from(body)] : []);
  const req = stream as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = headers;
  return req;
}

function captureOpenApi(req: IncomingMessage): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let status = 200;
    const chunks: Buffer[] = [];

    const finish = (nextStatus: number, raw: string) => {
      if (settled) return;
      settled = true;
      if (!raw) {
        resolve({ status: nextStatus, body: null });
        return;
      }
      try {
        resolve({ status: nextStatus, body: JSON.parse(raw) as unknown });
      } catch {
        resolve({ status: nextStatus, body: raw });
      }
    };

    const res = {
      statusCode: 200,
      setHeader() {
        return res;
      },
      writeHead(code: number) {
        status = code;
        res.statusCode = code;
        return res;
      },
      write(chunk: unknown) {
        if (chunk !== undefined && chunk !== null) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        }
        return true;
      },
      end(chunk?: unknown) {
        if (chunk !== undefined && chunk !== null) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        }
        finish(status, Buffer.concat(chunks).toString('utf8'));
        return res;
      },
    } as unknown as ServerResponse;

    handleOpenApiHttp(req, res)
      .then((handled) => {
        if (!handled) finish(404, JSON.stringify({ error: '未找到接口' }));
      })
      .catch(reject);
  });
}

async function callHarnessTool(
  tool: HarnessTool,
  args: Record<string, unknown>,
  incoming: IncomingMessage,
): Promise<{ status: number; body: unknown }> {
  const rest = { ...args };
  const missing: string[] = [];
  const path = tool.path.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = rest[key];
    if (typeof value !== 'string' && typeof value !== 'number') {
      missing.push(key);
      return '';
    }
    delete rest[key];
    return encodeURIComponent(String(value));
  });
  if (missing.length) {
    return { status: 400, body: { error: `缺少参数 ${missing.join(', ')}` } };
  }

  const headers: Record<string, string> = {};
  const authorization = headerValue(incoming, 'authorization');
  if (authorization) headers.authorization = authorization;
  for (const header of tool.headers ?? []) {
    const value = headerValue(incoming, header.name);
    if (value) headers[header.name.toLowerCase()] = value;
    else if (header.required) missing.push(header.name);
  }
  if (missing.length) {
    return { status: 400, body: { error: `缺少请求头 ${missing.join(', ')}` } };
  }

  let url = path;
  let body: string | undefined;
  if (tool.method === 'GET' || tool.method === 'DELETE') {
    url += toQuery(rest);
  } else if (Object.keys(rest).length > 0) {
    body = JSON.stringify(rest);
    headers['content-type'] = 'application/json';
  }

  return captureOpenApi(fakeRequest(tool.method, url, headers, body));
}

type RpcOutcome =
  | { kind: 'result'; result: unknown }
  | { kind: 'error'; code: number; message: string };

async function handleRpc(request: RpcRequest, incoming: IncomingMessage): Promise<RpcOutcome | undefined> {
  const { method, params } = request;

  if (method === 'initialize') {
    const names = harnessTools.map((tool) => tool.name).join(', ');
    return {
      kind: 'result',
      result: {
        protocolVersion: protocolFrom(params),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: PRODUCT_NAME, version: '0.0.1' },
        instructions: [
          `可用工具：${names}。`,
          '文件与命令工具（read_file、write_file、edit_file、delete_file、grep_file、glob_file、exec）的目标沙箱由请求头 x-sandbox-id 指定。',
          '读、写、搜文件用专用工具，不要用 exec 代替。',
        ].join('\n'),
      },
    };
  }

  if (method === 'ping') return { kind: 'result', result: {} };

  if (method === 'tools/list') {
    if (asObject(params)?.cursor) {
      return { kind: 'result', result: { tools: [] } };
    }
    return { kind: 'result', result: { tools: mcpToolList() } };
  }

  if (method === 'tools/call') {
    const input = asObject(params);
    const name = input?.name;
    if (typeof name !== 'string' || !name.trim()) {
      return { kind: 'error', code: -32602, message: '缺少工具名称' };
    }
    const args = input?.arguments === undefined ? {} : input.arguments;
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return { kind: 'error', code: -32602, message: '工具参数必须是对象' };
    }
    const tool = harnessTools.find((item) => item.name === name);
    if (!tool) {
      return { kind: 'result', result: toolResult(`未知工具：${name}`, true) };
    }
    const outcome = await callHarnessTool(tool, args as Record<string, unknown>, incoming);
    const text = typeof outcome.body === 'string' ? outcome.body : JSON.stringify(outcome.body, null, 2);
    return { kind: 'result', result: toolResult(text, outcome.status >= 400) };
  }

  return undefined;
}

function reply(res: ServerResponse, req: IncomingMessage, status: number, body: unknown) {
  if (status === 200 && wantsEventStream(req)) {
    sendSse(res, body);
    return;
  }
  sendJson(res, status, body);
}

/** 独立运行且 MCP_ENABLED 打开时：POST /api/mcp。关闭时该路径不存在。 */
export async function handleMcpHttp(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  if (path !== '/api/mcp') return false;
  if (!isMcpEnabled()) {
    sendJson(res, 404, { error: 'not_found' });
    return true;
  }

  if (req.method === 'OPTIONS') {
    sendEmpty(res, 204);
    return true;
  }

  if (req.method === 'GET') {
    sendJson(res, 405, rpcError(null, -32000, '此服务为无状态 MCP，不提供服务端事件流'));
    return true;
  }

  if (req.method === 'DELETE') {
    sendJson(res, 405, rpcError(null, -32000, '此服务不使用 MCP 会话'));
    return true;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, rpcError(null, -32600, '仅支持 POST'));
    return true;
  }

  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    sendJson(res, 413, rpcError(null, -32600, '请求体过大'));
    return true;
  }

  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : undefined;
  } catch {
    sendJson(res, 400, rpcError(null, -32700, '请求体不是合法 JSON'));
    return true;
  }

  if (Array.isArray(parsed)) {
    sendJson(res, 400, rpcError(null, -32600, '不支持批量请求'));
    return true;
  }

  const request = parseRequest(parsed);
  if (!request) {
    sendJson(res, 400, rpcError(null, -32600, '无效的 JSON-RPC 请求'));
    return true;
  }

  const protocol = headerValue(req, 'mcp-protocol-version');
  if (request.method !== 'initialize' && protocol && !supportedProtocols.has(protocol)) {
    sendJson(res, 400, rpcError(request.id ?? null, -32600, '不支持的协议版本'));
    return true;
  }

  if (request.id === undefined) {
    sendEmpty(res, 202);
    return true;
  }

  let outcome: RpcOutcome | undefined;
  try {
    outcome = await handleRpc(request, req);
  } catch {
    sendJson(res, 500, rpcError(request.id, -32603, '内部错误'));
    return true;
  }

  if (!outcome) {
    reply(res, req, 200, rpcError(request.id, -32601, `未实现 ${request.method}`));
    return true;
  }
  if (outcome.kind === 'error') {
    reply(res, req, 200, rpcError(request.id, outcome.code, outcome.message));
    return true;
  }
  reply(res, req, 200, rpcResult(request.id, outcome.result));
  return true;
}
