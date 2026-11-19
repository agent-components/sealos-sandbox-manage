import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import cors from 'cors';
import { servePublic } from './infrastructure/static';
import { handleHarnessMenusHttp } from './modules/harness/menus.http';
import { handleHarnessToolsHttp } from './modules/harness/tools.http';
import { handleOpenApiHttp } from './modules/openapi/openapi.http';
import { createContext } from './trpc/context';
import { appRouter } from './router';

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const allowCors = cors();

export function createServer() {
  return createHTTPServer({
    middleware(req, res, next) {
      void (async () => {
        if (await handleHarnessMenusHttp(req, res)) return;
        if (await handleHarnessToolsHttp(req, res)) return;
        if (await handleOpenApiHttp(req, res)) return;
        const path = (req.url ?? '/').split('?')[0] ?? '/';
        if (path === '/trpc' || path.startsWith('/trpc/')) {
          allowCors(req, res, next);
          return;
        }
        if (servePublic(publicDir, req, res)) return;
        allowCors(req, res, next);
      })();
    },
    router: appRouter,
    createContext,
    basePath: '/trpc',
  });
}