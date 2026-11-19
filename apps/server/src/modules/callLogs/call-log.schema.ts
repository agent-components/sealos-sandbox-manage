import { z } from 'zod';

export const listCallLogsSchema = z.object({
  operation: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  current: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const callLogIdSchema = z.object({
  id: z.string().min(1),
});