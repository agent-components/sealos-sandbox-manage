import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../../trpc/trpc';
import { toTrpcError } from '../errors/map';
import { callLogIdSchema, listCallLogsSchema } from './call-log.schema';
import * as callLogService from './call-log.service';

export const callLogRouter = router({
  list: protectedProcedure
    .input(listCallLogsSchema.optional())
    .query(async ({ ctx, input }) => {
      try {
        const listed = await callLogService.listUserCallLogs(
          ctx.user.username,
          input ?? {},
        );
        if (!listed.ok) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: listed.error });
        }
        return listed.result;
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
  get: protectedProcedure.input(callLogIdSchema).query(async ({ ctx, input }) => {
    try {
      const detail = await callLogService.getUserCallLog(ctx.user.username, input.id);
      if (!detail.ok) {
        throw new TRPCError({
          code: detail.status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST',
          message: detail.error,
        });
      }
      return {
        log: detail.log,
        result: detail.result,
        resultLoadError: detail.resultLoadError,
      };
    } catch (error) {
      throw toTrpcError(error);
    }
  }),
});