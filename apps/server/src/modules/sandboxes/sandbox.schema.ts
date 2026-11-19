import { z } from 'zod';
import {
  CreateSandboxSchema,
  RunSandboxCommandSchema,
  SandboxStateSchema,
  TagsSchema,
  UpdateSandboxSchema,
} from './schema';

export const listSandboxesInputSchema = z.object({
  tag: z.array(z.string()).optional(),
  q: z.string().optional(),
  keyword: z.string().optional(),
  templateId: z.string().optional(),
  state: SandboxStateSchema.optional(),
  current: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).nullable().optional(),
  sort: z.enum(['lastActivityAt']).optional(),
  order: z.enum(['ascend', 'descend']).optional(),
});

export const sandboxIdSchema = z.object({
  id: z.string().min(1),
});

export const createSandboxInputSchema = CreateSandboxSchema;
export const updateSandboxInputSchema = UpdateSandboxSchema;
export const runCommandInputSchema = RunSandboxCommandSchema;

export const sandboxLogsInputSchema = z.object({
  id: z.string().min(1),
  pod: z.string().optional(),
  tailLines: z.number().int().min(50).max(5000).optional(),
  previous: z.boolean().optional(),
});

export const sandboxArtifactInputSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
});

export { TagsSchema };