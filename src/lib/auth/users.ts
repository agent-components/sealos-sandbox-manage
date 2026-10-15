import { getDb } from "@/lib/db/mongo";

export type UserDoc = {
  username: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicUser = {
  username: string;
};

let indexesReady = false;
let seedPromise: Promise<void> | null = null;

async function users() {
  const db = await getDb();
  const col = db.collection<UserDoc>("users");
  if (!indexesReady) {
    await col.createIndex({ username: 1 }, { unique: true });
    indexesReady = true;
  }
  return col;
}

/** Ensure boat.users exists and seed default admin if empty. */
export async function ensureUsersReady() {
  if (!seedPromise) {
    seedPromise = (async () => {
      const col = await users();
      const count = await col.countDocuments();
      if (count > 0) return;

      const username = process.env.BOAT_ADMIN_USERNAME || "admin";
      const password = process.env.BOAT_ADMIN_PASSWORD || "changeme";
      const now = new Date();
      await col.insertOne({
        username,
        password,
        createdAt: now,
        updatedAt: now,
      });
      console.info(`[boat] 已在 MongoDB 库 boat 中创建用户「${username}」`);
    })().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  await seedPromise;
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<PublicUser | null> {
  await ensureUsersReady();
  const col = await users();
  const user = await col.findOne({ username, password });
  if (!user) return null;
  return { username: user.username };
}

export async function createUser(
  username: string,
  password: string,
): Promise<PublicUser> {
  await ensureUsersReady();
  const col = await users();
  const now = new Date();
  await col.insertOne({
    username,
    password,
    createdAt: now,
    updatedAt: now,
  });
  return { username };
}

export async function findUser(username: string): Promise<PublicUser | null> {
  await ensureUsersReady();
  const col = await users();
  const user = await col.findOne(
    { username },
    { projection: { username: 1, _id: 0 } },
  );
  return user ? { username: user.username } : null;
}
