import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_REGION_ID,
  isRegionId,
  regionName,
  type RegionId,
} from "@/lib/sealos/region-catalog";

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
  regionId: RegionId;
  regionName: string;
};

export type RegionBillingGroup = BillingUsage & {
  regionId: RegionId;
  regionName: string;
  sandboxes: SandboxBillingRow[];
};

export type BillingReport = {
  from: string;
  to: string;
  total: BillingUsage;
  regions: RegionBillingGroup[];
};

type SegmentRow = {
  sandboxId: string;
  computeActive: boolean;
  cpu: number;
  memoryGi: number;
  diskGi: number;
  publicPorts: number;
  priceCpu: number;
  priceMemory: number;
  priceStorage: number;
  pricePort: number;
  startedAt: Date;
  endedAt: Date | null;
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
  const start = row.startedAt > from ? row.startedAt : from;
  const endRaw = row.endedAt ?? to;
  const end = endRaw < to ? endRaw : to;
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return;
  const hours = ms / 3_600_000;

  usage.storageGiHours += row.diskGi * hours;
  usage.storageCost += row.diskGi * hours * row.priceStorage;

  if (row.computeActive) {
    usage.cpuCoreHours += row.cpu * hours;
    usage.memoryGiHours += row.memoryGi * hours;
    usage.portHours += row.publicPorts * hours;
    usage.cpuCost += row.cpu * hours * row.priceCpu;
    usage.memoryCost += row.memoryGi * hours * row.priceMemory;
    usage.portCost += row.publicPorts * hours * row.pricePort;
  }

  usage.totalCost =
    usage.cpuCost + usage.memoryCost + usage.storageCost + usage.portCost;
}

function mergeUsage(target: BillingUsage, source: BillingUsage): void {
  target.cpuCoreHours += source.cpuCoreHours;
  target.memoryGiHours += source.memoryGiHours;
  target.storageGiHours += source.storageGiHours;
  target.portHours += source.portHours;
  target.cpuCost += source.cpuCost;
  target.memoryCost += source.memoryCost;
  target.storageCost += source.storageCost;
  target.portCost += source.portCost;
  target.totalCost += source.totalCost;
}

/** 当前用户在 [from, to] 内的用量与费用。未结束段算到 to。按区域再按沙箱汇总。 */
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
      regions: [],
    };
  }

  const rows = await prisma.usageSegment.findMany({
    where: {
      owner,
      startedAt: { lt: to },
      OR: [{ endedAt: null }, { endedAt: { gt: from } }],
    },
    orderBy: [{ sandboxId: "asc" }, { startedAt: "asc" }],
  });

  const bySandbox = new Map<string, BillingUsage>();
  for (const row of rows) {
    let usage = bySandbox.get(row.sandboxId);
    if (!usage) {
      usage = emptyUsage();
      bySandbox.set(row.sandboxId, usage);
    }
    addSegment(usage, row, from, to);
  }

  const sandboxIds = [...bySandbox.keys()];
  const records =
    sandboxIds.length === 0
      ? []
      : await prisma.sandboxRecord.findMany({
          where: { sandboxId: { in: sandboxIds } },
          select: { sandboxId: true, regionId: true },
        });
  const regionBySandbox = new Map(
    records.map((row) => [row.sandboxId, row.regionId]),
  );

  const byRegion = new Map<
    RegionId,
    { usage: BillingUsage; sandboxes: SandboxBillingRow[] }
  >();

  for (const [sandboxId, usage] of bySandbox) {
    const rawRegion = regionBySandbox.get(sandboxId) ?? DEFAULT_REGION_ID;
    const regionId = isRegionId(rawRegion) ? rawRegion : DEFAULT_REGION_ID;
    const finalized = finalizeUsage(usage);
    const row: SandboxBillingRow = {
      sandboxId,
      regionId,
      regionName: regionName(regionId),
      ...finalized,
    };
    let group = byRegion.get(regionId);
    if (!group) {
      group = { usage: emptyUsage(), sandboxes: [] };
      byRegion.set(regionId, group);
    }
    group.sandboxes.push(row);
    mergeUsage(group.usage, finalized);
  }

  const total = emptyUsage();
  const regions: RegionBillingGroup[] = [...byRegion.entries()]
    .map(([regionId, group]) => {
      group.sandboxes.sort(
        (a, b) => b.totalCost - a.totalCost || a.sandboxId.localeCompare(b.sandboxId),
      );
      const regionTotal = finalizeUsage(group.usage);
      mergeUsage(total, regionTotal);
      return {
        regionId,
        regionName: regionName(regionId),
        ...regionTotal,
        sandboxes: group.sandboxes,
      };
    })
    .sort(
      (a, b) =>
        b.totalCost - a.totalCost || a.regionId.localeCompare(b.regionId),
    );

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    total: finalizeUsage(total),
    regions,
  };
}

/** 本月月初 00:00（本地时区）到现在。 */
export function defaultBillingRange(now = new Date()): { from: Date; to: Date } {
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: now,
  };
}
