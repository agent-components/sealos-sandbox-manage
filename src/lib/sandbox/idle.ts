import type { Document } from "mongodb";
import { getCollection } from "@/lib/db/mongo";
import {
  DEFAULT_IDLE_CONFIG,
  type IdleConfig,
  type Sandbox,
} from "@/lib/sandbox/schema";

type SandboxIdleDoc = Document & {
  sandboxId: string;
  owner: string;
  autoShutdown: boolean;
  idleMinutes: number;
  lastActivityAt: Date;
  inflight: number;
  updatedAt: Date;
};

async function idleCollection() {
  const col = await getCollection<SandboxIdleDoc>("sandbox_idle");
  await col.createIndex({ owner: 1, sandboxId: 1 }, { unique: true });
  await col.createIndex({ autoShutdown: 1, lastActivityAt: 1 });
  return col;
}

function asConfig(doc: Pick<SandboxIdleDoc, "autoShutdown" | "idleMinutes"> | null): IdleConfig {
  if (!doc) return { ...DEFAULT_IDLE_CONFIG };
  return {
    autoShutdown: !!doc.autoShutdown,
    idleMinutes:
      typeof doc.idleMinutes === "number" && doc.idleMinutes >= 5
        ? doc.idleMinutes
        : DEFAULT_IDLE_CONFIG.idleMinutes,
  };
}

export async function setSandboxIdleConfig(
  owner: string,
  sandboxId: string,
  config: IdleConfig,
): Promise<void> {
  const col = await idleCollection();
  const now = new Date();
  await col.updateOne(
    { owner, sandboxId },
    {
      $set: {
        autoShutdown: config.autoShutdown,
        idleMinutes: config.idleMinutes,
        updatedAt: now,
      },
      $setOnInsert: {
        owner,
        sandboxId,
        lastActivityAt: now,
        inflight: 0,
      },
    },
    { upsert: true },
  );
}

export async function deleteSandboxIdle(
  owner: string,
  sandboxId: string,
): Promise<void> {
  const col = await idleCollection();
  await col.deleteOne({ owner, sandboxId });
}

export async function withSandboxIdle(
  owner: string,
  sandboxes: Sandbox[],
): Promise<Sandbox[]> {
  if (sandboxes.length === 0) return sandboxes;
  const col = await idleCollection();
  const docs = await col
    .find({
      owner,
      sandboxId: { $in: sandboxes.map((sandbox) => sandbox.id) },
    })
    .toArray();
  const byId = new Map(docs.map((doc) => [doc.sandboxId, doc]));
  return sandboxes.map((sandbox) => {
    const config = asConfig(byId.get(sandbox.id) ?? null);
    return {
      ...sandbox,
      autoShutdown: config.autoShutdown,
      idleMinutes: config.idleMinutes,
    };
  });
}

/** 沙箱 API 请求开始：有空闲配置的沙箱才增加 inflight。 */
export async function beginMcpActivity(sandboxId: string): Promise<void> {
  try {
    const col = await idleCollection();
    await col.updateOne({ sandboxId }, { $inc: { inflight: 1 }, $set: { updatedAt: new Date() } });
  } catch (error) {
    console.error("空闲 inflight 增加失败", error);
  }
}

/**
 * 沙箱 API 请求结束。鉴权失败传 touch: false。
 * 成功时刷新 lastActivityAt，并减少 inflight（下限 0）。
 */
export async function endMcpActivity(
  sandboxId: string,
  opts?: { touch?: boolean },
): Promise<void> {
  const touch = opts?.touch !== false;
  try {
    const col = await idleCollection();
    const now = new Date();
    await col.updateOne({ sandboxId }, [
      {
        $set: {
          inflight: {
            $max: [0, { $add: [{ $ifNull: ["$inflight", 0] }, -1] }],
          },
          ...(touch ? { lastActivityAt: now } : {}),
          updatedAt: now,
        },
      },
    ]);
  } catch (error) {
    console.error("空闲活动结束失败", error);
  }
}

/** 创建成功后写入活动时间（不经 inflight）。 */
export async function touchMcpActivity(sandboxId: string): Promise<void> {
  try {
    const col = await idleCollection();
    const now = new Date();
    await col.updateOne(
      { sandboxId },
      { $set: { lastActivityAt: now, updatedAt: now } },
    );
  } catch (error) {
    console.error("空闲活动刷新失败", error);
  }
}

export type IdleCandidate = {
  sandboxId: string;
  owner: string;
  idleMinutes: number;
  lastActivityAt: Date;
};

/** 扫描候选：已开自动关机、无进行中请求、空闲时间够长。 */
export async function listIdleShutdownCandidates(
  now = new Date(),
): Promise<IdleCandidate[]> {
  const col = await idleCollection();
  const docs = await col
    .find({
      autoShutdown: true,
      $or: [{ inflight: { $lte: 0 } }, { inflight: { $exists: false } }],
    })
    .toArray();
  return docs
    .filter((doc) => {
      const minutes =
        typeof doc.idleMinutes === "number" && doc.idleMinutes >= 5
          ? doc.idleMinutes
          : DEFAULT_IDLE_CONFIG.idleMinutes;
      const last = doc.lastActivityAt ?? doc.updatedAt;
      if (!(last instanceof Date)) return false;
      return now.getTime() - last.getTime() >= minutes * 60_000;
    })
    .map((doc) => ({
      sandboxId: doc.sandboxId,
      owner: doc.owner,
      idleMinutes: doc.idleMinutes,
      lastActivityAt: doc.lastActivityAt,
    }));
}

export async function withMcpSandboxActivity<T>(
  sandboxId: string,
  run: () => Promise<T>,
  opts?: { shouldTouch?: (result: T) => boolean },
): Promise<T> {
  await beginMcpActivity(sandboxId);
  let touch = true;
  try {
    const result = await run();
    if (opts?.shouldTouch) touch = opts.shouldTouch(result);
    return result;
  } catch (error) {
    touch = false;
    throw error;
  } finally {
    await endMcpActivity(sandboxId, { touch });
  }
}
