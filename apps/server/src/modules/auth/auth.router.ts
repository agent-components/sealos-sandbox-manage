import { TRPCError } from '@trpc/server';
import { publicProcedure, protectedProcedure, router } from '../../trpc/trpc';
import { isMcpEnabled } from '../../infrastructure/env';
import { harnessSsoInputSchema, loginInputSchema } from './auth.schema';
import { loginWithHarnessSso, loginWithPassword, logoutWithToken } from './auth.service';
import { readUserToken } from './users';
import { toTrpcError } from '../errors/map';

export const authRouter = router({
  login: publicProcedure.input(loginInputSchema).mutation(async ({ input }) => {
    try {
      return await loginWithPassword(input.username, input.password);
    } catch (error) {
      throw toTrpcError(error);
    }
  }),
  harnessSso: publicProcedure.input(harnessSsoInputSchema).mutation(async ({ input }) => {
    try {
      return await loginWithHarnessSso(input.code);
    } catch (error) {
      throw toTrpcError(error);
    }
  }),
  me: protectedProcedure.query(({ ctx }) => ctx.user),
  /** 前端运行时开关：MCP 入口不区分嵌入 / 独立模式。 */
  config: publicProcedure.query(() => ({ mcpEnabled: isMcpEnabled() })),
  token: protectedProcedure.query(async ({ ctx }) => {
    const token = await readUserToken(ctx.user.username);
    if (!token) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '当前用户没有令牌' });
    }
    return { token };
  }),
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    await logoutWithToken(ctx.token);
  }),
});