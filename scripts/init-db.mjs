import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "boat";
const username = process.env.BOAT_ADMIN_USERNAME || "admin";
const password = process.env.BOAT_ADMIN_PASSWORD || "changeme";
const defaultImage = process.env.SEALOS_DEFAULT_IMAGE || "nginx:alpine";
const defaultPort = Number(process.env.SEALOS_DEFAULT_PORT ?? "80") || 80;

if (!uri) {
  console.error("请设置 MONGODB_URI");
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

  const templates = db.collection("templates");
  await templates.createIndex({ id: 1 }, { unique: true });
  const existingTpl = await templates.findOne({ id: "nginx" });
  if (!existingTpl) {
    const now = new Date();
    await templates.insertOne({
      id: "nginx",
      name: "Nginx",
      description: "默认 Web 服务模板",
      image: defaultImage,
      cpu: 0.5,
      memoryGi: 0.5,
      diskGi: 3,
      port: defaultPort,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`已创建默认模板 nginx（镜像 ${defaultImage}）`);
  } else {
    console.log("默认模板 nginx 已存在");
  }

  console.log(
    "集合：",
    (await db.listCollections().toArray()).map((c) => c.name).join(", "),
  );
} finally {
  await client.close();
}
