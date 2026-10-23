import { getBillingPrices } from "@/lib/billing/prices";
import { query } from "@/lib/db/postgres";
import type { LaunchpadApp } from "@/lib/sealos/map";
import { toSandbox } from "@/lib/sealos/map";

export type UsageSnapshot = {
  sandboxId: string;
  owner: string;
  /** true 时计 CPU、内存、公网端口；存储始终计 */
  computeActive: boolean;
  cpu: number;
  memoryGi: number;
  diskGi: number;
  publicPorts: number;
};

type OpenSegmentRow = {
  id: string;
  compute_active: boolean;
  cpu: number;
  memory_gi: number;
  disk_gi: number;
  public_ports: number;
};

function sameSnapshot(open: OpenSegmentRow, snap: UsageSnapshot): boolean {
  return (
    open.compute_active === snap.computeActive &&
    open.cpu === snap.cpu &&
    open.memory_gi === snap.memoryGi &&
    open.disk_gi === snap.diskGi &&
    open.public_ports === snap.publicPorts
  );
}

/** 从 Launchpad 应用提取当前用量快照。 */
export function snapshotFromApp(
  app: LaunchpadApp,
  owner: string,
): UsageSnapshot {
  const sandbox = toSandbox(app);
  const replicas = Math.max(1, sandbox.replicas ?? 1);
  return {
    sandboxId: sandbox.id,
    owner,
    computeActive: sandbox.state === "running",
    cpu: sandbox.cpu * replicas,
    memoryGi: sandbox.memoryGi * replicas,
    diskGi: sandbox.diskGi,
    publicPorts: (sandbox.ports ?? []).filter((p) => p.isPublic === true)
      .length,
  };
}

async function getOpenSegment(
  sandboxId: string,
): Promise<OpenSegmentRow | null> {
  const result = await query<OpenSegmentRow>(
    `SELECT id::text, compute_active, cpu, memory_gi, disk_gi, public_ports
     FROM sandbox.usage_segments
     WHERE sandbox_id = $1 AND ended_at IS NULL
     LIMIT 1`,
    [sandboxId],
  );
  return result.rows[0] ?? null;
}

async function closeOpenSegment(sandboxId: string, at: Date): Promise<void> {
  await query(
    `UPDATE sandbox.usage_segments
     SET ended_at = $2
     WHERE sandbox_id = $1 AND ended_at IS NULL`,
    [sandboxId, at],
  );
}

async function openSegment(snap: UsageSnapshot, at: Date): Promise<void> {
  const prices = getBillingPrices();
  await query(
    `INSERT INTO sandbox.usage_segments (
       sandbox_id, owner, compute_active, cpu, memory_gi, disk_gi, public_ports,
       price_cpu, price_memory, price_storage, price_port, started_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      snap.sandboxId,
      snap.owner,
      snap.computeActive,
      snap.cpu,
      snap.memoryGi,
      snap.diskGi,
      snap.publicPorts,
      prices.cpu,
      prices.memory,
      prices.storage,
      prices.port,
      at,
    ],
  );
}

/**
 * 对齐一台沙箱的用量段。
 * - 传入快照：规格或运行标记变化时切段
 * - end: true：只结束未闭合段（删除或已从 Launchpad 消失）
 */
export async function reconcileSandboxUsage(
  input: UsageSnapshot | { sandboxId: string; end: true },
): Promise<void> {
  const now = new Date();

  if ("end" in input) {
    await closeOpenSegment(input.sandboxId, now);
    return;
  }

  const open = await getOpenSegment(input.sandboxId);
  if (open && sameSnapshot(open, input)) return;

  if (open) {
    await closeOpenSegment(input.sandboxId, now);
  }
  await openSegment(input, now);
}

/**
 * 对本轮 Launchpad 列表中的应用逐台对齐；
 * 库里有而列表没有的沙箱结束未闭合段。
 * 仅在 listApps 成功后调用。
 */
export async function reconcileUsageFromLaunchpad(
  apps: LaunchpadApp[],
  ownerById: Map<string, string>,
): Promise<void> {
  const present = new Set<string>();
  for (const app of apps) {
    const owner = ownerById.get(app.name);
    if (!owner) continue;
    present.add(app.name);
    try {
      await reconcileSandboxUsage(snapshotFromApp(app, owner));
    } catch (error) {
      console.error(`对齐用量失败：${app.name}`, error);
    }
  }

  const missing = await query<{ sandbox_id: string }>(
    `SELECT sandbox_id
     FROM sandbox.usage_segments
     WHERE ended_at IS NULL
       AND NOT (sandbox_id = ANY($1::text[]))`,
    [[...present]],
  );
  for (const row of missing.rows) {
    try {
      await reconcileSandboxUsage({ sandboxId: row.sandbox_id, end: true });
    } catch (error) {
      console.error(`结束用量失败：${row.sandbox_id}`, error);
    }
  }
}
