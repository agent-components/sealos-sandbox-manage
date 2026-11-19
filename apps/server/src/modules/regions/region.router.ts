import { adminProcedure, protectedProcedure, router } from '../../trpc/trpc';
import { toTrpcError } from '../errors/map';
import { regionIdParamSchema, upsertRegionSchema } from './region.schema';
import * as regionService from './region.service';

export const regionRouter = router({
  listPublic: protectedProcedure.query(async () => {
    try {
      return await regionService.listPublicRegions();
    } catch (error) {
      throw toTrpcError(error);
    }
  }),
  listAdmin: adminProcedure.query(async () => {
    try {
      return await regionService.listAdminRegions();
    } catch (error) {
      throw toTrpcError(error);
    }
  }),
  upsert: adminProcedure
    .input(upsertRegionSchema)
    .mutation(async ({ input }) => {
      try {
        return await regionService.upsertRegion(input.id, input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
  clear: adminProcedure.input(regionIdParamSchema).mutation(async ({ input }) => {
    try {
      return await regionService.clearRegion(input.id);
    } catch (error) {
      throw toTrpcError(error);
    }
  }),
  setDefault: adminProcedure.input(regionIdParamSchema).mutation(async ({ input }) => {
    try {
      return await regionService.setDefault(input.id);
    } catch (error) {
      throw toTrpcError(error);
    }
  }),
});