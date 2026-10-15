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

export const SandboxSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  state: SandboxStateSchema,
  cpu: z.number(),
  memoryGi: z.number(),
  diskGi: z.number(),
  publicUrl: z.string().nullable(),
  image: z.string().optional(),
  templateId: z.string().optional(),
  createdAt: z.string().optional(),
  upTime: z.string().optional(),
});

export type Sandbox = z.infer<typeof SandboxSchema>;

export const CreateSandboxSchema = z.object({
  templateId: z.string().min(1, "请选择模板"),
  cpu: ResourceSpecSchema.shape.cpu.optional(),
  memoryGi: ResourceSpecSchema.shape.memoryGi.optional(),
  diskGi: ResourceSpecSchema.shape.diskGi.optional(),
  name: z
    .string()
    .min(1)
    .max(48)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
      message: "名称只能包含小写字母、数字和连字符，且首尾为字母或数字",
    })
    .optional(),
});

export const UpdateSandboxSchema = ResourceSpecSchema;
