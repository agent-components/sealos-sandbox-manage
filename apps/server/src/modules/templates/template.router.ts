import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../../trpc/trpc';
import { toTrpcError } from '../errors/map';
import {
  createTemplateInputSchema,
  listTemplatesInputSchema,
  templateIdSchema,
  updateTemplateInputSchema,
} from './template.schema';
import * as templateService from './template.service';

function mapStatusError(result: { error?: string; status: number }): never {
  throw new TRPCError({
    code:
      result.status === 403
        ? 'FORBIDDEN'
        : result.status === 404
          ? 'NOT_FOUND'
          : result.status === 409
            ? 'CONFLICT'
            : 'BAD_REQUEST',
    message: result.error ?? '请求失败',
  });
}

function isErrorResult(
  result: { error?: string; status: number },
): result is { error: string; status: number } {
  return typeof result.error === 'string';
}

export const templateRouter = router({
  list: protectedProcedure
    .input(listTemplatesInputSchema.optional())
    .query(async ({ ctx, input }) => {
      try {
        return await templateService.listTemplates(ctx.user.username, input ?? {});
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
  get: protectedProcedure.input(templateIdSchema).query(async ({ ctx, input }) => {
    try {
      const result = await templateService.getTemplateById(ctx.user.username, input.id);
      if (isErrorResult(result)) mapStatusError(result);
      return { template: result.template };
    } catch (error) {
      throw toTrpcError(error);
    }
  }),
  create: protectedProcedure
    .input(createTemplateInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await templateService.createTemplateForUser(ctx.user.username, input);
        if (isErrorResult(result)) mapStatusError(result);
        return { template: result.template };
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
  update: protectedProcedure
    .input(
      templateIdSchema.extend({
        patch: updateTemplateInputSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await templateService.updateTemplateForUser(
          ctx.user.username,
          input.id,
          input.patch,
        );
        if (isErrorResult(result)) mapStatusError(result);
        return { template: result.template };
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
  delete: protectedProcedure.input(templateIdSchema).mutation(async ({ ctx, input }) => {
    try {
      const result = await templateService.deleteTemplateForUser(ctx.user.username, input.id);
      if (isErrorResult(result)) mapStatusError(result);
      return { ok: true as const };
    } catch (error) {
      throw toTrpcError(error);
    }
  }),
  publish: protectedProcedure.input(templateIdSchema).mutation(async ({ ctx, input }) => {
    try {
      const result = await templateService.publishTemplateForUser(ctx.user.username, input.id);
      return { template: result.template };
    } catch (error) {
      throw toTrpcError(error);
    }
  }),
});