import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@boat/prisma';
import { requireDatabaseUrl } from './env';

export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }),
});