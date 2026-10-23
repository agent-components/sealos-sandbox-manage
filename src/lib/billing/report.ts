import { query } from "@/lib/db/postgres";

export type BillingUsage = {
  cpuCoreHours: number;
  memoryGiHours: number;
  storageGiHours: number;
  portHours: number;
  cpuCost: number;
  memoryCost: number;
  storageCost: number;
  portCost: number;
  totalCost: number;
};

export type SandboxBillingRow = BillingUsage & {
  sandboxId: string;
};

export type BillingReport = {
  from: string;
  to: string;
  total: BillingUsage;
  sandboxes: SandboxBillingRow[];
};

type SegmentRow = {
  sandbox_id: string;
  compute_active: boolean;
  cpu: number;
  memory_gi: number;
  disk_gi: number;
  public_ports: number;
  price_cpu: number;
  price_memory: number;
  price_storage: number;
  price_port: number;
  started_at: Date;
  ended_at: Date | null;
};

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function emptyUsage(): BillingUsage {
  return {
    cpuCoreHours: 0,
    memoryGiHours: 0,
    storageGiHours: 0,
    portHours: 0,
    cpuCost: 0,
    memoryCost: 0,
    storageCost: 0,
    portCost: 0,
    totalCost: 0,
  };
}

function finalizeUsage(usage: BillingUsage): BillingUsage {
  return {
    cpuCoreHours: round4(usage.cpuCoreHours),
    memoryGiHours: round4(usage.memoryGiHours),
    storageGiHours: round4(usage.storageGiHours),
    portHours: round4(usage.portHours),
    cpuCost: round4(usage.cpuCost),
    memoryCost: round4(usage.memoryCost),
    storageCost: round4(usage.storageCost),
    portCost: round4(usage.portCost),
    totalCost: round4(usage.totalCost),
  };
}

function addSegment(
  usage: BillingUsage,
  row: SegmentRow,
  from: Date,
  to: Date,
): void {
  const start = row.started_at > from ? row.started_at : from;
  const endRaw = row.ended_at ?? to;
  const end = endRaw < to ? endRaw : to;
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return;
  const hours = ms / 3_600_000;

  usage.storageGiHours += row.disk_gi * hours;
  usage.storageCost += row.disk_gi * hours * row.price_storage;

  if (row.compute_active) {
    usage.cpuCoreHours += row.cpu * hours;
    usage.memoryGiHours += row.memory_gi * hours;
    usage.portHours += row.public_ports * hours;
    usage.cpuCost += row.cpu * hours * row.price_cpu;
    usage.memoryCost += row.memory_gi * hours * row.price_memory;
    usage.portCost += row.public_ports * hours * row.price_port;
  }

  usage.totalCost =
    usage.cpuCost + usage.memoryCost + usage.storageCost + usage.portCost;
}

/** 当前用户在 [from, to] 内的用量与费用。未结束段算到 to。 */
export async function getBillingReport(
  owner: string,
  from: Date,
  to: Date,
): Promise<BillingReport> {
  if (to <= from) {
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      total: emptyUsage(),
      sandboxes: [],
    };
  }

  const result = await query<SegmentRow>(
    `SELECT sandbox_id, compute_active, cpu, memory_gi, disk_gi, public_ports,
            price_cpu, price_memory, price_storage, price_port,
            started_at, ended_at
     FROM sandbox.usage_segments
     WHERE owner = $1
       AND started_at < $3
       AND (ended_at IS NULL OR ended_at > $2)
     ORDER BY sandbox_id, started_at`,
    [owner, from, to],
  );

  const bySandbox = new Map<string, BillingUsage>();
  const total = emptyUsage();

  for (const row of result.rows) {
    let usage = bySandbox.get(row.sandbox_id);
    if (!usage) {
      usage = emptyUsage();
      bySandbox.set(row.sandbox_id, usage);
    }
    addSegment(usage, row, from, to);
    addSegment(total, row, from, to);
  }

  const sandboxes: SandboxBillingRow[] = [...bySandbox.entries()]
    .map(([sandboxId, usage]) => ({
      sandboxId,
      ...finalizeUsage(usage),
    }))
    .sort((a, b) => b.totalCost - a.totalCost || a.sandboxId.localeCompare(b.sandboxId));

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    total: finalizeUsage(total),
    sandboxes,
  };
}

/** 本月月初 00:00（本地时区）到现在。 */
export function defaultBillingRange(now = new Date()): { from: Date; to: Date } {
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: now,
  };
}
