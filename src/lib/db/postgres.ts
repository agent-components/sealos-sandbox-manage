import { readFileSync } from "fs";
import { join } from "path";
import { Pool, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _pg: { pool: Pool; ready: Promise<void> } | undefined;
}

function databaseUrl(): string {
  const uri = process.env.DATABASE_URL?.trim();
  if (!uri) {
    throw new Error("未配置 DATABASE_URL");
  }
  return uri;
}

async function ensureSchema(pool: Pool) {
  const sql = readFileSync(join(process.cwd(), "src/lib/db/schema.sql"), "utf8");
  await pool.query(sql);
}

export function getPool(): Pool {
  if (!global._pg) {
    const pool = new Pool({ connectionString: databaseUrl() });
    const ready = ensureSchema(pool).catch(async (error) => {
      await pool.end().catch(() => undefined);
      if (global._pg?.pool === pool) global._pg = undefined;
      throw error;
    });
    global._pg = { pool, ready };
  }
  return global._pg.pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  const pool = getPool();
  if (global._pg) await global._pg.ready;
  return pool.query<T>(text, params);
}
