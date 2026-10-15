import { z } from "zod";
import { ResourceSpecSchema } from "@/lib/sandbox/schema";

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
  ports: z.array(TemplatePortSchema).min(1),
  env: z.array(TemplateEnvSchema).default([]),
  storage: z.array(TemplateStorageSchema).default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Template = z.infer<typeof TemplateSchema>;
export type TemplatePort = z.infer<typeof TemplatePortSchema>;
export type TemplateEnv = z.infer<typeof TemplateEnvSchema>;
export type TemplateStorage = z.infer<typeof TemplateStorageSchema>;

export const CreateTemplateSchema = z.object({
  id: slugSchema,
  name: z.string().min(1).max(64),
  description: z.string().max(200).optional(),
  image: z.string().min(1).max(256),
  imageRegistry: TemplateImageRegistrySchema.nullable().optional(),
  launchCommand: TemplateLaunchCommandSchema.optional(),
  cpu: ResourceSpecSchema.shape.cpu.default(0.5),
  memoryGi: ResourceSpecSchema.shape.memoryGi.default(0.5),
  replicas: z.number().int().min(1).max(20).default(1),
  ports: z
    .array(TemplatePortSchema)
    .min(1)
    .default([{ number: 80, protocol: "http", isPublic: true }]),
  env: z.array(TemplateEnvSchema).default([]),
  storage: z
    .array(TemplateStorageSchema)
    .default([{ name: "data", path: "/data", size: "3Gi" }]),
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

/** 从 storage 列表取首个 Gi 数值，供创建沙箱时覆盖磁盘 */
export function primaryDiskGi(storage: TemplateStorage[] | undefined): number {
  const raw = storage?.[0]?.size ?? "3Gi";
  const m = String(raw).match(/^(\d+(?:\.\d+)?)\s*Gi$/i);
  if (m) return Math.max(1, Math.min(1000, Math.round(Number(m[1]))));
  return 3;
}
