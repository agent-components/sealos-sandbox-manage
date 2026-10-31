import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_IDLE_CONFIG,
  type IdleConfig,
  type Sandbox,
} from "@/lib/sandbox/schema";

type IdleRow = {
  sandboxId: string;
  autoShutdown: boolean;
  idleMinutes: number;
  lastActivityAt: Date | null;
};

function asConfig(
  row: Pick<IdleRow, "autoShutdown" | "idleMinutes"> | null
): IdleConfig {
  if (!row) return { ...DEFAULT_IDLE_CONFIG };
  return {
    autoShutdown: !!row.autoShutdown,
    idleMinutes:
      typeof row.idleMinutes === "number" && row.idleMinutes >= 5
        ? row.idleMinutes
        : DEFAULT_IDLE_CONFIG.idleMinutes,
  };
}

export async function setSandboxIdleConfig(
  owner: string,
  sandboxId: string,
  config: IdleConfig
): Promise<void> {
  await prisma.sandboxRecord.updateMany({
    where: { owner, sandboxId },
    data: {
      autoShutdown: config.autoShutdown,
      idleMinutes: config.idleMinutes,
    },
  });
}

export async function withSandboxIdle(
  owner: string,
  sandboxes: Sandbox[]
): Promise<Sandbox[]> {
  if (sandboxes.length === 0) return sandboxes;
  const rows = await prisma.sandboxRecord.findMany({
    where: {
      owner,
      sandboxId: { in: sandboxes.map((sandbox) => sandbox.id) },
    },
    select: {
      sandboxId: true,
      autoShutdown: true,
      idleMinutes: true,
      lastActivityAt: true,
    },
  });
  const byId = new Map(rows.map((row) => [row.sandboxId, row]));
  return sandboxes.map((sandbox) => {
    const row = byId.get(sandbox.id);
    const config = asConfig(row ?? null);
    return {
      ...sandbox,
      autoShutdown: config.autoShutdown,
      idleMinutes: config.idleMinutes,
      lastActivityAt: row?.lastActivityAt
        ? row.lastActivityAt.toISOString()
        : sandbox.lastActivityAt,
    };
  });
}

/** MCP 工具调用开始：有记录的沙箱才增加 inflight。 */
export async function beginMcpActivity(sandboxId: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE sandbox.records
      SET inflight = inflight + 1, updated_at = now()
      WHERE sandbox_id = ${sandboxId}`;
  } catch (error) {
    console.error("空闲 inflight 增加失败", error);
  }
}

/**
 * MCP 工具调用结束。失败/中止传 touch: false。
 * 成功时刷新 last_activity_at，并减少 inflight（下限 0）。
 * 另见 touchSandboxActivity（开机）。
 */
export async function endMcpActivity(
  sandboxId: string,
  opts?: { touch?: boolean }
): Promise<void> {
  const touch = opts?.touch !== false;
  try {
    await prisma.$executeRaw`
      UPDATE sandbox.records
      SET inflight = GREATEST(0, inflight - 1),
          last_activity_at = CASE WHEN ${touch}::boolean THEN now() ELSE last_activity_at END,
          updated_at = now()
      WHERE sandbox_id = ${sandboxId}`;
  } catch (error) {
    console.error("空闲活动结束失败", error);
  }
}

/** 开机时刷新活跃时间，避免沿用关机前的时间戳被立刻再次空闲关机。 */
export async function touchSandboxActivity(sandboxId: string): Promise<void> {
  await prisma.sandboxRecord.updateMany({
    where: { sandboxId },
    data: { lastActivityAt: new Date() },
  });
}

export type IdleCandidate = {
  sandboxId: string;
  owner: string;
  idleMinutes: number;
  lastActivityAt: Date;
};

/** 扫描候选：库内仍为 running、已开自动关机、无进行中请求、空闲时间够长。 */
export async function listIdleShutdownCandidates(
  now = new Date()
): Promise<IdleCandidate[]> {
  const rows = await prisma.$queryRaw<
    {
      sandbox_id: string;
      owner: string;
      idle_minutes: number;
      last_activity_at: Date;
    }[]
  >`
    SELECT sandbox_id, owner, GREATEST(idle_minutes, 5) AS idle_minutes, last_activity_at
    FROM sandbox.records
    WHERE auto_shutdown = true
      AND state = 'running'
      AND inflight <= 0
      AND last_activity_at <= ${now}::timestamptz - (GREATEST(idle_minutes, 5) * interval '1 minute')`;
  return rows.map((row) => ({
    sandboxId: row.sandbox_id,
    owner: row.owner,
    idleMinutes: row.idle_minutes,
    lastActivityAt: row.last_activity_at,
  }));
}

export async function withMcpSandboxActivity<T>(
  sandboxId: string,
  run: () => Promise<T>,
  opts?: { shouldTouch?: (result: T) => boolean }
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
