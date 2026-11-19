import { z } from 'zod';

export const updateSettingsSchema = z.object({
  logRetentionDays: z.number().int().min(1).max(3650).nullable(),
});