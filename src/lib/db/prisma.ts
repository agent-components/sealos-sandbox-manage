import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var _prisma: PrismaClient | undefined;
}

function databaseUrl(): string {
  const uri = process.env.DATABASE_URL?.trim();
  if (!uri) {
    throw new Error("未配置 DATABASE_URL");
  }
  return uri;
}

export const prisma =
  global._prisma ??
  new PrismaClient({
    datasources: {
      db: { url: databaseUrl() },
    },
  });

if (process.env.NODE_ENV !== "production") {
  global._prisma = prisma;
}
