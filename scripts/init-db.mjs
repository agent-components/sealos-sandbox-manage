import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const username = "admin";
const password = "changeme";

if (!uri) {
  console.error("请设置 MONGODB_URI");
  process.exit(1);
}

let dbName = "";
try {
  dbName = decodeURIComponent(new URL(uri).pathname.replace(/^\//, ""));
} catch {
  console.error("MONGODB_URI 不是合法的连接串");
  process.exit(1);
}
if (!dbName) {
  console.error(
    "MONGODB_URI 需要在路径中写数据库名，例如 mongodb://user:pass@host:27017/boat?authSource=admin",
  );
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  await db.command({ ping: 1 });

  const users = db.collection("users");
  await users.createIndex({ username: 1 }, { unique: true });

  const existingUser = await users.findOne({ username });
  if (!existingUser) {
    const now = new Date();
    await users.insertOne({
      username,
      password,
      createdAt: now,
      updatedAt: now,
    });
    console.log(
      `数据库「${dbName}」就绪；已创建用户「${username}」/ ${password}`,
    );
  } else {
    console.log(`数据库「${dbName}」就绪；用户「${username}」已存在`);
  }
} finally {
  await client.close();
}
