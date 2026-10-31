import {
  DEFAULT_BILLING_PRICES,
  normalizeBillingPrices,
  type BillingPrices,
} from "@/lib/billing/prices";
import { prisma } from "@/lib/db/prisma";
import { SealosApiError } from "@/lib/sealos/errors";
import { loadKubeContext } from "@/lib/sealos/kube";
import {
  REGION_CATALOG,
  isRegionId,
  regionName,
  type RegionId,
} from "@/lib/sealos/region-catalog";

export type RegionCredentials = {
  id: RegionId;
  name: string;
  launchpadBase: string;
  kubeconfig: string;
  isDefault: boolean;
  enabled: boolean;
};

export type RegionPublic = {
  id: RegionId;
  name: string;
  isDefault: boolean;
};

export type RegionAdminView = {
  id: RegionId;
  name: string;
  launchpadBase: string | null;
  configured: boolean;
  enabled: boolean;
  isDefault: boolean;
  prices: BillingPrices;
  updatedAt: string | null;
};

type CacheEntry = {
  at: number;
  rows: Awaited<ReturnType<typeof loadAllRows>>;
};

const CACHE_TTL_MS = 30_000;
let cache: CacheEntry | null = null;

function invalidateCache() {
  cache = null;
}

async function loadAllRows() {
  return prisma.sealosRegion.findMany();
}

async function cachedRows() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await loadAllRows();
  cache = { at: now, rows };
  return rows;
}

function assertValidKubeconfig(yaml: string) {
  try {
    loadKubeContext(yaml);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "kubeconfig 格式无效";
    throw new SealosApiError(message, 400);
  }
}

function toCredentials(row: {
  id: string;
  launchpadBase: string;
  kubeconfig: string;
  isDefault: boolean;
  enabled: boolean;
}): RegionCredentials | null {
  if (!isRegionId(row.id)) return null;
  if (!row.enabled || !row.kubeconfig.trim() || !row.launchpadBase.trim()) {
    return null;
  }
  return {
    id: row.id,
    name: regionName(row.id),
    launchpadBase: row.launchpadBase.replace(/\/$/, ""),
    kubeconfig: row.kubeconfig,
    isDefault: row.isDefault,
    enabled: row.enabled,
  };
}

/** 已配置且可用的区域（创建沙箱选区）。 */
export async function listRegionsPublic(): Promise<RegionPublic[]> {
  const rows = await cachedRows();
  const configured = rows
    .map(toCredentials)
    .filter((r): r is RegionCredentials => r != null)
    .map((r) => ({
      id: r.id,
      name: r.name,
      isDefault: r.isDefault,
    }));

  if (configured.length === 0) return [];
  // 保证有且仅展示一个默认标记：优先 DB isDefault，否则第一项
  const hasDefault = configured.some((r) => r.isDefault);
  if (!hasDefault && configured[0]) {
    configured[0] = { ...configured[0], isDefault: true };
  }
  return configured;
}

/** 管理端：固定三区状态，不回传 kubeconfig。 */
export async function listRegionsAdmin(): Promise<RegionAdminView[]> {
  const rows = await cachedRows();
  const byId = new Map(rows.map((r) => [r.id, r]));

  return REGION_CATALOG.map((entry) => {
    const row = byId.get(entry.id);
    const configured = Boolean(
      row?.enabled && row.kubeconfig.trim() && row.launchpadBase.trim(),
    );
    return {
      id: entry.id,
      name: entry.name,
      launchpadBase: row?.launchpadBase?.replace(/\/$/, "") || null,
      configured,
      enabled: row?.enabled ?? false,
      isDefault: row?.isDefault ?? false,
      prices: row
        ? normalizeBillingPrices({
            cpu: row.priceCpu,
            memory: row.priceMemory,
            storage: row.priceStorage,
            port: row.pricePort,
          })
        : { ...DEFAULT_BILLING_PRICES },
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  });
}

export async function getRegion(id: string): Promise<RegionCredentials> {
  if (!isRegionId(id)) {
    throw new SealosApiError(`未知区域：${id}`, 400);
  }
  const rows = await cachedRows();
  const row = rows.find((r) => r.id === id);
  const creds = row ? toCredentials(row) : null;
  if (creds) return creds;
  throw new SealosApiError(`区域「${regionName(id)}」尚未配置凭证`, 400);
}

export async function getDefaultRegion(): Promise<RegionCredentials> {
  const rows = await cachedRows();
  const configured = rows
    .map(toCredentials)
    .filter((r): r is RegionCredentials => r != null);
  const preferred =
    configured.find((r) => r.isDefault) ?? configured[0] ?? null;
  if (preferred) return preferred;
  throw new SealosApiError(
    "尚未配置任何 Sealos 区域，请在「集群设置」中填写凭证",
    400,
  );
}

export async function listConfiguredRegions(): Promise<RegionCredentials[]> {
  const rows = await cachedRows();
  return rows
    .map(toCredentials)
    .filter((r): r is RegionCredentials => r != null);
}

export async function resolveRegionForSandbox(
  sandboxId: string,
): Promise<RegionCredentials> {
  const record = await prisma.sandboxRecord.findUnique({
    where: { sandboxId },
    select: { regionId: true },
  });
  const regionId = record?.regionId;
  if (regionId && isRegionId(regionId)) {
    return getRegion(regionId);
  }
  // 无记录或异常 id 时回退默认（兼容极旧数据）
  return getDefaultRegion();
}

export async function upsertRegionConfig(
  id: string,
  input: {
    launchpadBase: string;
    kubeconfig?: string | null;
    prices?: Partial<BillingPrices> | null;
  },
): Promise<RegionAdminView> {
  if (!isRegionId(id)) {
    throw new SealosApiError(`未知区域：${id}`, 400);
  }
  const launchpadBase = input.launchpadBase.trim().replace(/\/$/, "");
  if (!launchpadBase) {
    throw new SealosApiError("请填写 Launchpad 地址", 400);
  }

  const existing = await prisma.sealosRegion.findUnique({ where: { id } });
  let kubeconfig = input.kubeconfig?.trim() ?? "";
  if (!kubeconfig) {
    kubeconfig = existing?.kubeconfig?.trim() ?? "";
  }
  if (!kubeconfig) {
    throw new SealosApiError("请提供 kubeconfig", 400);
  }
  assertValidKubeconfig(kubeconfig);

  const prices = normalizeBillingPrices(
    input.prices ??
      (existing
        ? {
            cpu: existing.priceCpu,
            memory: existing.priceMemory,
            storage: existing.priceStorage,
            port: existing.pricePort,
          }
        : undefined),
  );

  const anyDefault = await prisma.sealosRegion.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });
  const makeDefault = !anyDefault || anyDefault.id === id;

  await prisma.$transaction(async (tx) => {
    if (makeDefault) {
      await tx.sealosRegion.updateMany({
        where: { isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }
    await tx.sealosRegion.upsert({
      where: { id },
      create: {
        id,
        launchpadBase,
        kubeconfig,
        enabled: true,
        isDefault: makeDefault || !anyDefault,
        priceCpu: prices.cpu,
        priceMemory: prices.memory,
        priceStorage: prices.storage,
        pricePort: prices.port,
      },
      update: {
        launchpadBase,
        kubeconfig,
        enabled: true,
        priceCpu: prices.cpu,
        priceMemory: prices.memory,
        priceStorage: prices.storage,
        pricePort: prices.port,
        ...(makeDefault ? { isDefault: true } : {}),
      },
    });
  });

  invalidateCache();
  const list = await listRegionsAdmin();
  return list.find((r) => r.id === id)!;
}

export async function clearRegionConfig(id: string): Promise<RegionAdminView> {
  if (!isRegionId(id)) {
    throw new SealosApiError(`未知区域：${id}`, 400);
  }

  const existing = await prisma.sealosRegion.findUnique({ where: { id } });
  if (!existing) {
    throw new SealosApiError(`区域「${regionName(id)}」尚未配置`, 404);
  }

  const sandboxCount = await prisma.sandboxRecord.count({
    where: { regionId: id },
  });
  if (sandboxCount > 0) {
    throw new SealosApiError(
      `区域「${regionName(id)}」仍有 ${sandboxCount} 个沙箱，无法清空凭证`,
      409,
    );
  }

  const configuredCount = await prisma.sealosRegion.count({
    where: { enabled: true, NOT: { kubeconfig: "" } },
  });
  if (existing.isDefault && configuredCount <= 1) {
    throw new SealosApiError("不能清空唯一的默认区域，请先配置并指定其他默认区域", 409);
  }

  await prisma.$transaction(async (tx) => {
    await tx.sealosRegion.update({
      where: { id },
      data: {
        kubeconfig: "",
        launchpadBase: "",
        enabled: false,
        isDefault: false,
      },
    });
    if (existing.isDefault) {
      const next = await tx.sealosRegion.findFirst({
        where: {
          enabled: true,
          NOT: { id },
          kubeconfig: { not: "" },
        },
        orderBy: { createdAt: "asc" },
      });
      if (next) {
        await tx.sealosRegion.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  });

  invalidateCache();
  const list = await listRegionsAdmin();
  return list.find((r) => r.id === id)!;
}

export async function setDefaultRegion(id: string): Promise<RegionAdminView> {
  if (!isRegionId(id)) {
    throw new SealosApiError(`未知区域：${id}`, 400);
  }
  const row = await prisma.sealosRegion.findUnique({ where: { id } });
  if (!row || !row.enabled || !row.kubeconfig.trim()) {
    throw new SealosApiError(
      `区域「${regionName(id)}」尚未配置凭证，无法设为默认`,
      400,
    );
  }

  await prisma.$transaction([
    prisma.sealosRegion.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    }),
    prisma.sealosRegion.update({
      where: { id },
      data: { isDefault: true },
    }),
  ]);

  invalidateCache();
  const list = await listRegionsAdmin();
  return list.find((r) => r.id === id)!;
}

