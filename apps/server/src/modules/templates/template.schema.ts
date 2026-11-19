import { z } from 'zod';
import { CreateTemplateSchema, UpdateTemplateSchema } from './schema';

export const listTemplatesInputSchema = z.object({
  q: z.string().optional(),
  isPublic: z.boolean().optional(),
  current: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const templateIdSchema = z.object({
  id: z.string().min(1),
});

export const createTemplateInputSchema = CreateTemplateSchema;
export const updateTemplateInputSchema = UpdateTemplateSchema;