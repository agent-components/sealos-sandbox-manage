import { query } from "@/lib/db/postgres";
import {
  DEFAULT_IDLE_CONFIG,
  type IdleConfig,
  type Sandbox,
} from "@/lib/sandbox/schema";

type IdleRow = {
  sandbox_id: string;
  auto_shutdown: boolean;
  idle_minutes: number;
};

function asConfig(
  row: Pick<IdleRow, "auto_shutdown" | "idle_minutes"> | null
): IdleConfig {
  if (!row) return { ...DEFAULT_IDLE_CONFIG };
  return {
    autoShutdown: !!row.auto_shutdown,
    idleMinutes:
      typeof row.idle_minutes === "number" && row.idle_minutes >= 5
        ? row.idle_minutes
        : DEFAULT_IDLE_CONFIG.idleMinutes,
  };
}

export async function setSandboxIdleConfig(
  owner: string,
  sandboxId: string,
  config: IdleConfig
): Promise<void> {
  await query(
    `UPDATE sandbox.records
     SET auto_shutdown = $3,
         idle_minutes = $4,
         updated_at = now()
     WHERE owner = $1 AND sandbox_id = $2`,
    [owner, sandboxId, config.autoShutdown, config.idleMinutes]
  );
}

export async function withSandboxIdle(
  owner: string,
  sandboxes: Sandbox[]
): Promise<Sandbox[]> {
  if (sandboxes.length === 0) return sandboxes;
  const result = await query<IdleRow>(
    `SELECT sandbox_id, auto_shutdown, idle_minutes
     FROM sandbox.records
     WHERE owner = $1 AND sandbox_id = ANY($2::text[])`,
    [owner, sandboxes.map((sandbox) => sandbox.id)]
  );
  const byId = new Map(result.rows.map((row) => [row.sandbox_id, row]));
  return sandboxes.map((sandbox) => {
    const config = asConfig(byId.get(sandbox.id) ?? null);
    return {
      ...sandbox,
      autoShutdown: config.autoShutdown,
      idleMinutes: config.idleMinutes,
    };
  });
}

/** 沙箱 API 请求开始：有记录的沙箱才增加 inflight。 */
export async function beginMcpActivity(sandboxId: string): Promise<void> {
  try {
    await query(
      `UPDATE sandbox.records
       SET inflight = inflight + 1, updated_at = now()
       WHERE sandbox_id = $1`,
      [sandboxId]
    );
  } catch (error) {
    console.error("空闲 inflight 增加失败", error);
  }
}

/**
 * 沙箱 API 请求结束。鉴权失败传 touch: false。
 * 成功时刷新 last_activity_at，并减少 inflight（下限 0）。
 */
export async function endMcpActivity(
  sandboxId: string,
  opts?: { touch?: boolean }
): Promise<void> {
  const touch = opts?.touch !== false;
  try {
    await query(
      `UPDATE sandbox.records
       SET inflight = GREATEST(0, inflight - 1),
           last_activity_at = CASE WHEN $2::boolean THEN now() ELSE last_activity_at END,
           updated_at = now()
       WHERE sandbox_id = $1`,
      [sandboxId, touch]
    );
  } catch (error) {
    console.error("空闲活动结束失败", error);
  }
}

/** 创建成功后写入活动时间（不经 inflight）。 */
export async function touchMcpActivity(sandboxId: string): Promise<void> {
  try {
    await query(
      `UPDATE sandbox.records
       SET last_activity_at = now(), updated_at = now()
       WHERE sandbox_id = $1`,
      [sandboxId]
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
  now = new Date()
): Promise<IdleCandidate[]> {
  const result = await query<{
    sandbox_id: string;
    owner: string;
    idle_minutes: number;
    last_activity_at: Date;
  }>(
    `SELECT sandbox_id, owner, GREATEST(idle_minutes, 5) AS idle_minutes, last_activity_at
     FROM sandbox.records
     WHERE auto_shutdown = true
       AND inflight <= 0
       AND last_activity_at <= $1::timestamptz - (GREATEST(idle_minutes, 5) * interval '1 minute')`,
    [now]
  );
  return result.rows.map((row) => ({
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
