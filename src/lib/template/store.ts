import type { Document } from "mongodb";
import { getCollection } from "@/lib/db/mongo";
import type {
  Template,
  TemplateConfigMap,
  TemplateEnv,
  TemplatePort,
  TemplateStorage,
} from "@/lib/template/schema";

type TemplateDoc = Document & {
  id: string;
  name: string;
  description?: string;
  image: string;
  imageRegistry?: {
    username: string;
    password: string;
    serverAddress: string;
  } | null;
  launchCommand?: { command?: string; args?: string[] };
  cpu: number;
  memoryGi: number;
  replicas: number;
  autoShutdown?: boolean;
  idleMinutes?: number;
  ports: TemplatePort[];
  env: TemplateEnv[];
  storage: TemplateStorage[];
  configMap: TemplateConfigMap[];
  createdAt: Date;
  updatedAt: Date;
};

function toTemplate(doc: TemplateDoc): Template {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description,
    image: doc.image,
    imageRegistry: doc.imageRegistry ?? null,
    launchCommand: doc.launchCommand,
    cpu: doc.cpu,
    memoryGi: doc.memoryGi,
    replicas: doc.replicas ?? 1,
    autoShutdown: doc.autoShutdown ?? false,
    idleMinutes:
      typeof doc.idleMinutes === "number" && doc.idleMinutes >= 5
        ? doc.idleMinutes
        : 5,
    ports: doc.ports?.length
      ? doc.ports
      : [{ number: 80, protocol: "http", isPublic: true }],
    env: doc.env ?? [],
    storage: doc.storage ?? [],
    configMap: doc.configMap ?? [],
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
    imageRegistry: input.imageRegistry ?? null,
    replicas: input.replicas ?? 1,
    autoShutdown: input.autoShutdown ?? false,
    idleMinutes: input.idleMinutes ?? 5,
    ports: input.ports,
    env: input.env ?? [],
    storage: input.storage ?? [],
    configMap: input.configMap ?? [],
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
