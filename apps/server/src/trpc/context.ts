import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import type { PrismaClient } from '@sealos-sandbox-manage/prisma';
import { findUserByToken, type PublicUser } from '../modules/auth/users';
import { readBearerToken } from '../modules/auth/token';
import { db } from '../infrastructure/database';

export type Context = {
  db: PrismaClient;
  user: PublicUser | null;
  token: string | null;
};

export async function createContext({ req }: CreateHTTPContextOptions): Promise<Context> {
  const token = readBearerToken(req);
  const user = token ? await findUserByToken(token) : null;
  return { db, user, token };
}