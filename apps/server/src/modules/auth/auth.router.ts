import { publicProcedure, protectedProcedure, router } from '../../trpc/trpc';
import { harnessSsoInputSchema, loginInputSchema } from './auth.schema';
import { loginWithHarnessSso, loginWithPassword, logoutWithToken } from './auth.service';
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
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    await logoutWithToken(ctx.token);
  }),
});