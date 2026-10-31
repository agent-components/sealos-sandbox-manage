import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { execFileSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const uri = process.env.DATABASE_URL?.trim();

if (!uri) {
  console.error("请设置 DATABASE_URL");
  process.exit(1);
}

const prismaBin = require.resolve("prisma/build/index.js");

function runPrisma(args) {
  execFileSync(process.execPath, [prismaBin, ...args], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
}

try {
  runPrisma(["generate"]);
  runPrisma(["db", "push", "--skip-generate"]);
  runPrisma([
    "db",
    "execute",
    "--schema",
    join(root, "prisma/schema.prisma"),
    "--file",
    join(root, "prisma/extra-indexes.sql"),
  ]);
} catch {
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  // 兼容旧数据：NULL 与空数组在业务上都表示不限制工具
  await prisma.$executeRawUnsafe(
    `UPDATE sandbox.api_keys SET allowed_tools = '{}' WHERE allowed_tools IS NULL`,
  );
  const users = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM public.users`,
  );
  const tables = await prisma.$queryRawUnsafe(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'sandbox' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  console.log(
    `数据库就绪。登录复用 public.users（${users[0].count} 个账号）。schema sandbox 中的表：${tables.map((row) => row.table_name).join("、")}`,
  );
} finally {
  await prisma.$disconnect();
}
