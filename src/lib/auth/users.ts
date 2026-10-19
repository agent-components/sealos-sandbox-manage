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

async function users() {
  const db = await getDb();
  const col = db.collection<UserDoc>("users");
  if (!indexesReady) {
    await col.createIndex({ username: 1 }, { unique: true });
    indexesReady = true;
  }
  return col;
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<PublicUser | null> {
  const col = await users();
  const user = await col.findOne({ username, password });
  if (!user) return null;
  return { username: user.username };
}

export async function createUser(
  username: string,
  password: string,
): Promise<PublicUser> {
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
  const col = await users();
  const user = await col.findOne(
    { username },
    { projection: { username: 1, _id: 0 } },
  );
  return user ? { username: user.username } : null;
}
