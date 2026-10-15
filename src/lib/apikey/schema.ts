import { z } from "zod";

export const ApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
  createdAt: z.string().optional(),
  lastUsedAt: z.string().nullable().optional(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1, "请填写名称").max(64),
});

export const MAX_API_KEYS_PER_USER = 20;
