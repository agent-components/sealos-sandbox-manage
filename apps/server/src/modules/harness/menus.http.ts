import type { IncomingMessage, ServerResponse } from 'node:http';

export type HarnessMenu = {
  key: string;
  label: string;
  path?: string;
  children?: HarnessMenu[];
};

/** 嵌入宿主侧栏拉取；与前端路由 path 对齐。 */
export const harnessMenus: HarnessMenu[] = [
  { key: 'sandboxes', label: '沙箱列表', path: '/sandboxes' },
  { key: 'templates', label: '模板管理', path: '/templates' },
  { key: 'call-logs', label: '调用日志', path: '/call-logs' },
];

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  res.end(payload);
}

/** 公开：GET /api/harness/menus（无需认证）。 */
export async function handleHarnessMenusHttp(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  if (path !== '/api/harness/menus') return false;

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }

  sendJson(res, 200, { menus: harnessMenus });
  return true;
}
