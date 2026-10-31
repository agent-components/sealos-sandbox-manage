import { getBillingPrices } from "@/lib/billing/prices";
import { prisma } from "@/lib/db/prisma";
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
  id: bigint;
  computeActive: boolean;
  cpu: number;
  memoryGi: number;
  diskGi: number;
  publicPorts: number;
};

function sameSnapshot(open: OpenSegmentRow, snap: UsageSnapshot): boolean {
  return (
    open.computeActive === snap.computeActive &&
    open.cpu === snap.cpu &&
    open.memoryGi === snap.memoryGi &&
    open.diskGi === snap.diskGi &&
    open.publicPorts === snap.publicPorts
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
  return prisma.usageSegment.findFirst({
    where: { sandboxId, endedAt: null },
    select: {
      id: true,
      computeActive: true,
      cpu: true,
      memoryGi: true,
      diskGi: true,
      publicPorts: true,
    },
  });
}

async function closeOpenSegment(sandboxId: string, at: Date): Promise<void> {
  await prisma.usageSegment.updateMany({
    where: { sandboxId, endedAt: null },
    data: { endedAt: at },
  });
}

async function openSegment(snap: UsageSnapshot, at: Date): Promise<void> {
  const prices = getBillingPrices();
  await prisma.usageSegment.create({
    data: {
      sandboxId: snap.sandboxId,
      owner: snap.owner,
      computeActive: snap.computeActive,
      cpu: snap.cpu,
      memoryGi: snap.memoryGi,
      diskGi: snap.diskGi,
      publicPorts: snap.publicPorts,
      priceCpu: prices.cpu,
      priceMemory: prices.memory,
      priceStorage: prices.storage,
      pricePort: prices.port,
      startedAt: at,
    },
  });
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

  const openRows = await prisma.usageSegment.findMany({
    where: { endedAt: null },
    select: { sandboxId: true },
  });
  for (const row of openRows) {
    if (present.has(row.sandboxId)) continue;
    try {
      await reconcileSandboxUsage({ sandboxId: row.sandboxId, end: true });
    } catch (error) {
      console.error(`结束用量失败：${row.sandboxId}`, error);
    }
  }
}
