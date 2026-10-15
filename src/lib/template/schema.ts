import { z } from "zod";
import { ResourceSpecSchema } from "@/lib/sandbox/schema";

const slugSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
    message: "ID 只能包含小写字母、数字和连字符，且首尾为字母或数字",
  });

export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(64),
  description: z.string().max(200).optional(),
  image: z.string().min(1).max(256),
  cpu: ResourceSpecSchema.shape.cpu,
  memoryGi: ResourceSpecSchema.shape.memoryGi,
  diskGi: ResourceSpecSchema.shape.diskGi,
  port: z.number().int().min(1).max(65535).default(80),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Template = z.infer<typeof TemplateSchema>;

export const CreateTemplateSchema = z.object({
  id: slugSchema,
  name: z.string().min(1).max(64),
  description: z.string().max(200).optional(),
  image: z.string().min(1).max(256),
  cpu: ResourceSpecSchema.shape.cpu.default(0.5),
  memoryGi: ResourceSpecSchema.shape.memoryGi.default(0.5),
  diskGi: ResourceSpecSchema.shape.diskGi.default(3),
  port: z.number().int().min(1).max(65535).default(80),
});

export const UpdateTemplateSchema = CreateTemplateSchema.omit({
  id: true,
}).partial();
