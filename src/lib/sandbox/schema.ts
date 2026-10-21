import { z } from "zod";
import { CPU_OPTIONS, MEMORY_OPTIONS } from "@/lib/sealos/resources";

export const SandboxStateSchema = z.enum([
  "starting",
  "running",
  "stopped",
  "error",
]);

export type SandboxState = z.infer<typeof SandboxStateSchema>;

export const ResourceSpecSchema = z.object({
  cpu: z.number().refine((v) => (CPU_OPTIONS as readonly number[]).includes(v), {
    message: "CPU 档位无效",
  }),
  memoryGi: z
    .number()
    .refine((v) => MEMORY_OPTIONS.some((m) => m.gi === v), {
      message: "内存档位无效",
    }),
  diskGi: z.number().int().min(1).max(1000),
});

/** 以字母或数字开头，其余可为字母、数字、点、下划线、连字符 */
const tagPattern = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,31}$/u;

export const TagSchema = z
  .string()
  .trim()
  .min(1, "标签不能为空")
  .max(32, "单个标签最长 32 个字符")
  .regex(tagPattern, {
    message: "标签须以字母或数字开头，只能包含字母、数字、.、_、-",
  });

export const TagsSchema = z
  .array(TagSchema)
  .max(20, "最多 20 个标签")
  .transform((tags) => {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const tag of tags) {
      const key = tag.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(tag);
    }
    return unique;
  });

export type SandboxTags = z.infer<typeof TagsSchema>;

/** 空闲自动关机的等待分钟数，至少 5 分钟 */
export const IdleMinutesSchema = z
  .number()
  .int("等待时长须为整数分钟")
  .min(5, "等待时长至少 5 分钟")
  .max(10080, "等待时长最长 7 天");

export const IdleConfigSchema = z.object({
  autoShutdown: z.boolean(),
  idleMinutes: IdleMinutesSchema,
});

export type IdleConfig = z.infer<typeof IdleConfigSchema>;

export const DEFAULT_IDLE_CONFIG: IdleConfig = {
  autoShutdown: false,
  idleMinutes: 5,
};

export const SandboxPortSchema = z.object({
  number: z.number().int(),
  protocol: z
    .enum(["http", "grpc", "ws", "tcp", "udp", "sctp"])
    .optional(),
  isPublic: z.boolean().optional(),
  publicAddress: z.string().nullable(),
  privateAddress: z.string().nullable(),
});

export type SandboxPort = z.infer<typeof SandboxPortSchema>;

export const SandboxEnvSchema = z.object({
  name: z.string(),
  value: z.string().default(""),
});

export const SandboxStorageSchema = z.object({
  name: z.string().optional(),
  path: z.string(),
  size: z.string().optional(),
});

export const SandboxConfigMapSchema = z.object({
  path: z.string(),
  value: z.string().default(""),
});

export const SandboxLaunchCommandSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
});

export const SandboxImageRegistrySchema = z.object({
  username: z.string().optional(),
  serverAddress: z.string().optional(),
  /** 仅表示是否配置了密码，不回传明文 */
  hasPassword: z.boolean().optional(),
});

export type SandboxEnv = z.infer<typeof SandboxEnvSchema>;
export type SandboxStorage = z.infer<typeof SandboxStorageSchema>;
export type SandboxConfigMap = z.infer<typeof SandboxConfigMapSchema>;

export const SandboxSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  state: SandboxStateSchema,
  cpu: z.number(),
  memoryGi: z.number(),
  diskGi: z.number(),
  replicas: z.number().int().min(1).default(1),
  publicUrl: z.string().nullable(),
  ports: z.array(SandboxPortSchema).default([]),
  env: z.array(SandboxEnvSchema).default([]),
  storage: z.array(SandboxStorageSchema).default([]),
  configMap: z.array(SandboxConfigMapSchema).default([]),
  launchCommand: SandboxLaunchCommandSchema.optional(),
  image: z.string().optional(),
  imageRegistry: SandboxImageRegistrySchema.nullable().optional(),
  templateId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  autoShutdown: z.boolean().default(false),
  idleMinutes: IdleMinutesSchema.default(5),
  createdAt: z.string().optional(),
  upTime: z.string().optional(),
});

export type Sandbox = z.infer<typeof SandboxSchema>;

export const CreateSandboxEnvSchema = z.object({
  name: z.string().min(1).max(128),
  value: z.string().max(4096).default(""),
});

export const CreateSandboxSchema = z.object({
  templateId: z.string().min(1, "请选择模板"),
  cpu: ResourceSpecSchema.shape.cpu.optional(),
  memoryGi: ResourceSpecSchema.shape.memoryGi.optional(),
  diskGi: ResourceSpecSchema.shape.diskGi.optional(),
  env: z.array(CreateSandboxEnvSchema).default([]),
  tags: TagsSchema.default([]),
  autoShutdown: z.boolean().optional(),
  idleMinutes: IdleMinutesSchema.optional(),
  name: z
    .string()
    .min(1)
    .max(48)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
      message: "名称只能包含小写字母、数字和连字符，且首尾为字母或数字",
    })
    .optional(),
});

export const RunSandboxCommandSchema = z.object({
  command: z.string().trim().min(1, "请提供命令").max(16384, "命令最长 16384 个字符"),
});

export const ArtifactPathSchema = z
  .string()
  .trim()
  .min(1, "请提供文件路径")
  .max(4096, "路径最长 4096 个字符")
  .refine((value) => value.startsWith("/"), "路径必须是沙箱内的绝对路径")
  .refine((value) => !value.includes("\0"), "路径无效");

export type RunSandboxCommand = z.infer<typeof RunSandboxCommandSchema>;

export const UpdateSandboxSchema = z
  .object({
    cpu: ResourceSpecSchema.shape.cpu.optional(),
    memoryGi: ResourceSpecSchema.shape.memoryGi.optional(),
    diskGi: ResourceSpecSchema.shape.diskGi.optional(),
    env: z.array(CreateSandboxEnvSchema).optional(),
    tags: TagsSchema.optional(),
    autoShutdown: z.boolean().optional(),
    idleMinutes: IdleMinutesSchema.optional(),
  })
  .refine(
    (value) =>
      value.cpu !== undefined ||
      value.memoryGi !== undefined ||
      value.diskGi !== undefined ||
      value.env !== undefined ||
      value.tags !== undefined ||
      value.autoShutdown !== undefined ||
      value.idleMinutes !== undefined,
    { message: "没有可更新的字段" },
  )
  .refine(
    (value) => {
      const count = [value.cpu, value.memoryGi, value.diskGi].filter(
        (item) => item !== undefined,
      ).length;
      return count === 0 || count === 3;
    },
    { message: "更新规格时需要同时提供 CPU、内存和磁盘" },
  );
