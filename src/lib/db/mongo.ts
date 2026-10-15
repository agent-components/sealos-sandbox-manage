import { MongoClient, type Db, type Collection, type Document } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "boat";

declare global {
  // eslint-disable-next-line no-var
  var __boatMongo: { client: MongoClient; db: Db } | undefined;
}

export async function getDb(): Promise<Db> {
  if (!uri) {
    throw new Error("未配置 MONGODB_URI");
  }

  if (global.__boatMongo) {
    return global.__boatMongo.db;
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  global.__boatMongo = { client, db };
  return db;
}

export async function getCollection<TSchema extends Document = Document>(
  name: string,
): Promise<Collection<TSchema>> {
  const db = await getDb();
  return db.collection<TSchema>(name);
}
