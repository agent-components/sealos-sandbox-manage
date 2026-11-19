import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'),
  quiet: true,
});

export function requireDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return connectionString;
}