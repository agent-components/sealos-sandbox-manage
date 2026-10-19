import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const uri = process.env.DATABASE_URL?.trim();

if (!uri) {
  console.error("请设置 DATABASE_URL");
  process.exit(1);
}

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/lib/db/schema.sql"),
  "utf8",
);

const client = new pg.Client({ connectionString: uri });

try {
  await client.connect();
  await client.query(sql);
  const users = await client.query(
    `SELECT count(*)::int AS count FROM public.users`,
  );
  const tables = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'sandbox' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  console.log(
    `数据库就绪。登录复用 public.users（${users.rows[0].count} 个账号）。schema sandbox 中的表：${tables.rows.map((row) => row.table_name).join("、")}`,
  );
} finally {
  await client.end();
}
