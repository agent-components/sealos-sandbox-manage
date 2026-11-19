import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../../trpc/trpc';
import { toTrpcError } from '../errors/map';
import { billingRangeSchema } from './billing.schema';
import { getBillingReportForUser } from './billing.service';

export const billingRouter = router({
  getReport: protectedProcedure
    .input(billingRangeSchema.optional())
    .query(async ({ ctx, input }) => {
      try {
        const result = await getBillingReportForUser(ctx.user.username, input ?? {});
        if (!result.ok) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: result.error,
          });
        }
        return result.report;
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
});