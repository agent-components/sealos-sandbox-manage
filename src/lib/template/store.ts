import type { Document } from "mongodb";
import { getCollection } from "@/lib/db/mongo";
import type { Template } from "@/lib/template/schema";

type TemplateDoc = Document & {
  id: string;
  name: string;
  description?: string;
  image: string;
  cpu: number;
  memoryGi: number;
  diskGi: number;
  port: number;
  createdAt: Date;
  updatedAt: Date;
};

function toTemplate(doc: TemplateDoc): Template {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description,
    image: doc.image,
    cpu: doc.cpu,
    memoryGi: doc.memoryGi,
    diskGi: doc.diskGi,
    port: doc.port,
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

async function templates() {
  const col = await getCollection<TemplateDoc>("templates");
  await col.createIndex({ id: 1 }, { unique: true });
  return col;
}

export async function listTemplates(): Promise<Template[]> {
  const col = await templates();
  const docs = await col.find({}).sort({ createdAt: 1 }).toArray();
  return docs.map(toTemplate);
}

export async function getTemplate(id: string): Promise<Template | null> {
  const col = await templates();
  const doc = await col.findOne({ id });
  return doc ? toTemplate(doc) : null;
}

export async function createTemplate(
  input: Omit<Template, "createdAt" | "updatedAt">,
): Promise<Template> {
  const col = await templates();
  const now = new Date();
  const doc: TemplateDoc = {
    ...input,
    port: input.port ?? 80,
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  return toTemplate(doc);
}

export async function updateTemplate(
  id: string,
  patch: Partial<Omit<Template, "id" | "createdAt" | "updatedAt">>,
): Promise<Template | null> {
  const col = await templates();
  const result = await col.findOneAndUpdate(
    { id },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return result ? toTemplate(result) : null;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const col = await templates();
  const result = await col.deleteOne({ id });
  return result.deletedCount > 0;
}

/** 库为空时写入默认模板 */
export async function ensureDefaultTemplate(): Promise<void> {
  const col = await templates();
  const count = await col.countDocuments();
  if (count > 0) return;

  const image = process.env.SEALOS_DEFAULT_IMAGE || "nginx:alpine";
  const port = Number(process.env.SEALOS_DEFAULT_PORT ?? "80") || 80;
  const now = new Date();
  await col.insertOne({
    id: "nginx",
    name: "Nginx",
    description: "默认 Web 服务模板",
    image,
    cpu: 0.5,
    memoryGi: 0.5,
    diskGi: 3,
    port,
    createdAt: now,
    updatedAt: now,
  });
}
