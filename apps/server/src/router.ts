import { authRouter } from './modules/auth/auth.router';
import { billingRouter } from './modules/billing/billing.router';
import { callLogRouter } from './modules/callLogs/call-log.router';
import { regionRouter } from './modules/regions/region.router';
import { sandboxRouter } from './modules/sandboxes/sandbox.router';
import { settingsRouter } from './modules/settings/settings.router';
import { templateRouter } from './modules/templates/template.router';
import { router } from './trpc/trpc';

/** 控制台前端 tRPC 入口（与 `apps/web` 的 `trpc.*` 调用一致） */
export const appRouter = router({
  auth: authRouter,
  sandboxes: sandboxRouter,
  templates: templateRouter,
  callLogs: callLogRouter,
  billing: router({
    get: billingRouter.getReport,
  }),
  regions: router({
    list: regionRouter.listPublic,
  }),
  admin: router({
    list: regionRouter.listAdmin,
    upsert: regionRouter.upsert,
    clear: regionRouter.clear,
    setDefault: regionRouter.setDefault,
  }),
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
