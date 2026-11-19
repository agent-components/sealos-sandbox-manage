import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/trpc';
import { toTrpcError } from '../errors/map';
import {
  createSandboxInputSchema,
  listSandboxesInputSchema,
  runCommandInputSchema,
  sandboxIdSchema,
  sandboxLogsInputSchema,
  updateSandboxInputSchema,
} from './sandbox.schema';
import { bindBearerToken } from '../auth/bind-request';
import * as sandboxService from './sandbox.service';

function withUser<T>(token: string | null, fn: () => Promise<T>): Promise<T> {
  bindBearerToken(token);
  return fn().catch((error) => {
    throw toTrpcError(error);
  });
}

export const sandboxRouter = router({
  list: protectedProcedure
    .input(listSandboxesInputSchema.optional())
    .query(({ ctx, input }) =>
      withUser(ctx.token, () =>
        sandboxService.listSandboxes(ctx.user.username, input ?? {}),
      ),
    ),
  create: protectedProcedure
    .input(createSandboxInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        bindBearerToken(ctx.token);
        const created = await sandboxService.createSandbox(ctx.user.username, input);
        if (created.status === 400) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'error' in created.body && typeof created.body.error === 'string'
                ? created.body.error
                : '无法创建沙箱',
          });
        }
        return created.body;
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
  get: protectedProcedure.input(sandboxIdSchema).query(({ ctx, input }) =>
    withUser(ctx.token, () =>
      sandboxService.getSandbox(ctx.user.username, input.id),
    ),
  ),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        patch: updateSandboxInputSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      withUser(ctx.token, () =>
        sandboxService.updateSandbox(ctx.user.username, input.id, input.patch),
      ),
    ),
  delete: protectedProcedure.input(sandboxIdSchema).mutation(({ ctx, input }) =>
    withUser(ctx.token, () =>
      sandboxService.deleteSandbox(ctx.user.username, input.id),
    ),
  ),
  stop: protectedProcedure.input(sandboxIdSchema).mutation(({ ctx, input }) =>
    withUser(ctx.token, () =>
      sandboxService.stopSandbox(ctx.user.username, input.id),
    ),
  ),
  resume: protectedProcedure.input(sandboxIdSchema).mutation(({ ctx, input }) =>
    withUser(ctx.token, () =>
      sandboxService.resumeSandbox(ctx.user.username, input.id),
    ),
  ),
  syncTemplate: protectedProcedure.input(sandboxIdSchema).mutation(({ ctx, input }) =>
    withUser(ctx.token, () =>
      sandboxService.syncSandboxTemplate(ctx.user.username, input.id),
    ),
  ),
  runCommand: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        body: runCommandInputSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      withUser(ctx.token, () =>
        sandboxService.runSandboxCommand(
          ctx.user.username,
          ctx.token,
          input.id,
          input.body,
        ),
      ),
    ),
  logs: protectedProcedure.input(sandboxLogsInputSchema).query(({ ctx, input }) =>
    withUser(ctx.token, () =>
      sandboxService.getSandboxLogs(ctx.user.username, input.id, {
        pod: input.pod,
        tailLines: input.tailLines,
        previous: input.previous,
      }),
    ),
  ),
  ephemeralDisk: protectedProcedure.input(sandboxIdSchema).query(({ ctx, input }) =>
    withUser(ctx.token, () =>
      sandboxService.getEphemeralDisk(ctx.user.username, ctx.token, input.id),
    ),
  ),
});