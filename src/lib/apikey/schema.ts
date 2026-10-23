import { z } from "zod";
import { MCP_TOOL_NAME_LIST } from "@/lib/mcp/tools";

const sandboxIdSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
    message: "沙箱 ID 只能包含小写字母、数字和连字符，且首尾为字母或数字",
  });

export const SandboxIdListSchema = z
  .array(sandboxIdSchema)
  .max(200, "最多授权 200 个沙箱")
  .transform((ids) => [...new Set(ids)]);

const mcpToolNameSchema = z.enum(MCP_TOOL_NAME_LIST);

/** 解析请求体中的工具列表：null / [] = 全开；非空 = 仅这些工具。 */
export const AllowedToolsValueSchema = z
  .array(mcpToolNameSchema)
  .max(MCP_TOOL_NAME_LIST.length)
  .nullable()
  .transform((tools): string[] | null => {
    if (tools == null || tools.length === 0) return null;
    return [...new Set(tools)];
  });

export const ApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
  sandboxIds: z.array(z.string()).default([]),
  /** null = 不限制 MCP 工具 */
  allowedTools: z.array(z.string()).nullable().default(null),
  createdAt: z.string().optional(),
  lastUsedAt: z.string().nullable().optional(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1, "请填写名称").max(64),
  sandboxIds: SandboxIdListSchema.optional().default([]),
  allowedTools: AllowedToolsValueSchema.optional().default(null),
});

export const UpdateApiKeySchema = z
  .object({
    name: z.string().trim().min(1, "请填写名称").max(64).optional(),
    sandboxIds: SandboxIdListSchema.optional(),
    allowedTools: AllowedToolsValueSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.sandboxIds !== undefined ||
      value.allowedTools !== undefined,
    { message: "没有可更新的字段" },
  );

export const MAX_API_KEYS_PER_USER = 20;
