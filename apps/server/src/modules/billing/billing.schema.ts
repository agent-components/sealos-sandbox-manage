import { z } from 'zod';

export const billingRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});