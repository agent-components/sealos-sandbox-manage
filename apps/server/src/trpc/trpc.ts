import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '未登录或登录已过期' });
  }

  return next({
    ctx: {
      user: ctx.user,
      token: ctx.token,
    },
  });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN', message: '没有权限' });
  }

  return next({ ctx });
});