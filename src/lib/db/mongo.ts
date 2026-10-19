import { MongoClient, type Db, type Collection, type Document } from "mongodb";

const uri = process.env.MONGODB_URI;

function databaseName(connectionUri: string): string {
  let pathname: string;
  try {
    pathname = new URL(connectionUri).pathname;
  } catch {
    throw new Error("MONGODB_URI 不是合法的连接串");
  }
  const name = decodeURIComponent(pathname.replace(/^\//, ""));
  if (!name) {
    throw new Error(
      "MONGODB_URI 需要在路径中写数据库名，例如 mongodb://user:pass@host:27017/boat?authSource=admin",
    );
  }
  return name;
}

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
  const db = client.db(databaseName(uri));
  global.__boatMongo = { client, db };
  return db;
}

export async function getCollection<TSchema extends Document = Document>(
  name: string,
): Promise<Collection<TSchema>> {
  const db = await getDb();
  return db.collection<TSchema>(name);
}
