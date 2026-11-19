import { adminProcedure, router } from '../../trpc/trpc';
import { toTrpcError } from '../errors/map';
import { updateSettingsSchema } from './settings.schema';
import * as settingsService from './settings.service';

export const settingsRouter = router({
  get: adminProcedure.query(async () => {
    try {
      return await settingsService.getSettings();
    } catch (error) {
      throw toTrpcError(error);
    }
  }),
  update: adminProcedure.input(updateSettingsSchema).mutation(async ({ input }) => {
    try {
      return await settingsService.updateSettings(input.logRetentionDays);
    } catch (error) {
      throw toTrpcError(error);
    }
  }),
});