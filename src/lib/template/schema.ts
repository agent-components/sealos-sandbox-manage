import { z } from "zod";
import {
  IdleMinutesSchema,
  ResourceSpecSchema,
} from "@/lib/sandbox/schema";

const slugSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
    message: "ID 只能包含小写字母、数字和连字符，且首尾为字母或数字",
  });

/** 对齐 Sealos CreatePortConfigSchema */
export const TemplatePortSchema = z.object({
  number: z.number().int().min(1).max(65535),
  protocol: z.enum(["http", "grpc", "ws", "tcp", "udp", "sctp"]).default("http"),
  isPublic: z.boolean().default(true),
});

/** 对齐 Sealos StandardEnvSchema（不含 valueFrom） */
export const TemplateEnvSchema = z.object({
  name: z.string().min(1).max(128),
  value: z.string().max(4096).default(""),
});

/** 对齐 Sealos StorageSchema */
export const TemplateStorageSchema = z.object({
  name: z.string().min(1).max(63),
  path: z.string().min(1).max(256),
  size: z.string().regex(/^\d+(\.\d+)?(Gi|Ti)$/i, {
    message: "容量格式如 3Gi、1Ti",
  }),
});

/** 对齐 Sealos CreateLaunchpadRequest.configMap（path + value） */
export const TemplateConfigMapSchema = z.object({
  path: z.string().min(1).max(256),
  value: z.string().max(1024 * 512).default(""),
});

/** 对齐 Sealos ImageSchema.imageRegistry */
export const TemplateImageRegistrySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  serverAddress: z.string().min(1),
});

/** 对齐 Sealos LaunchCommandSchema */
export const TemplateLaunchCommandSchema = z.object({
  command: z.string().max(512).optional(),
  args: z.array(z.string().max(512)).optional(),
});

export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(64),
  description: z.string().max(200).optional(),
  image: z.string().min(1).max(256),
  imageRegistry: TemplateImageRegistrySchema.nullable().optional(),
  launchCommand: TemplateLaunchCommandSchema.optional(),
  cpu: ResourceSpecSchema.shape.cpu,
  memoryGi: ResourceSpecSchema.shape.memoryGi,
  replicas: z.number().int().min(1).max(20).default(1),
  /** 空闲超时后是否自动关机 */
  autoShutdown: z.boolean().default(false),
  /** 空闲等待分钟数，至少 5 */
  idleMinutes: IdleMinutesSchema.default(5),
  ports: z.array(TemplatePortSchema).min(1),
  env: z.array(TemplateEnvSchema).default([]),
  storage: z.array(TemplateStorageSchema).default([]),
  configMap: z.array(TemplateConfigMapSchema).default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Template = z.infer<typeof TemplateSchema>;
export type TemplatePort = z.infer<typeof TemplatePortSchema>;
export type TemplateEnv = z.infer<typeof TemplateEnvSchema>;
export type TemplateStorage = z.infer<typeof TemplateStorageSchema>;
export type TemplateConfigMap = z.infer<typeof TemplateConfigMapSchema>;

export const CreateTemplateSchema = z.object({
  /** 可省略；省略时由服务端生成随机英文 ID */
  id: slugSchema.optional(),
  name: z.string().min(1).max(64),
  description: z.string().max(200).optional(),
  image: z.string().min(1).max(256),
  imageRegistry: TemplateImageRegistrySchema.nullable().optional(),
  launchCommand: TemplateLaunchCommandSchema.optional(),
  cpu: ResourceSpecSchema.shape.cpu.default(0.5),
  memoryGi: ResourceSpecSchema.shape.memoryGi.default(0.5),
  replicas: z.number().int().min(1).max(20).default(1),
  autoShutdown: z.boolean().default(false),
  idleMinutes: IdleMinutesSchema.default(5),
  ports: z
    .array(TemplatePortSchema)
    .min(1)
    .default([{ number: 80, protocol: "http", isPublic: true }]),
  env: z.array(TemplateEnvSchema).default([]),
  storage: z.array(TemplateStorageSchema).default([]),
  configMap: z.array(TemplateConfigMapSchema).default([]),
});

export const UpdateTemplateSchema = CreateTemplateSchema.omit({
  id: true,
}).partial();

export function defaultTemplatePorts(): TemplatePort[] {
  return [{ number: 80, protocol: "http", isPublic: true }];
}

export function defaultTemplateStorage(): TemplateStorage[] {
  return [{ name: "data", path: "/data", size: "3Gi" }];
}

/** 解析 Sealos size 字符串（如 3Gi、1Ti）为 Gi 数值 */
export function parseSizeToGi(size: string | undefined): number {
  const raw = String(size ?? "3Gi").trim();
  const gi = raw.match(/^(\d+(?:\.\d+)?)\s*Gi$/i);
  if (gi) return Math.max(1, Math.min(1000, Math.round(Number(gi[1]))));
  const ti = raw.match(/^(\d+(?:\.\d+)?)\s*Ti$/i);
  if (ti) {
    return Math.max(1, Math.min(1000, Math.round(Number(ti[1]) * 1024)));
  }
  const n = Number(raw);
  if (!Number.isNaN(n) && n > 0) {
    return Math.max(1, Math.min(1000, Math.round(n)));
  }
  return 3;
}

export function formatSizeGi(gi: number): string {
  return `${Math.max(1, Math.min(1000, Math.round(gi) || 1))}Gi`;
}

/** 从 storage 列表取首个 Gi 数值，供创建沙箱时覆盖磁盘 */
export function primaryDiskGi(storage: TemplateStorage[] | undefined): number {
  return parseSizeToGi(storage?.[0]?.size);
}
