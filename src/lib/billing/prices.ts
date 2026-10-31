import { prisma } from "@/lib/db/prisma";
import { isRegionId } from "@/lib/sealos/region-catalog";

export type BillingPrices = {
  cpu: number;
  memory: number;
  storage: number;
  port: number;
};

/** 内置默认单价（元），与广州 G 公开价一致；区域未配置时回退。 */
export const DEFAULT_BILLING_PRICES: BillingPrices = {
  cpu: 0.01742,
  memory: 0.008786,
  storage: 0.000532,
  port: 0.007,
};

export function normalizeBillingPrices(
  input: Partial<BillingPrices> | null | undefined,
  fallback: BillingPrices = DEFAULT_BILLING_PRICES,
): BillingPrices {
  return {
    cpu: normalizeOne(input?.cpu, fallback.cpu),
    memory: normalizeOne(input?.memory, fallback.memory),
    storage: normalizeOne(input?.storage, fallback.storage),
    port: normalizeOne(input?.port, fallback.port),
  };
}

function normalizeOne(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}

/** 按区域读取单价；未知或未配置时用内置默认。 */
export async function getBillingPrices(
  regionId?: string | null,
): Promise<BillingPrices> {
  if (!regionId || !isRegionId(regionId)) {
    return { ...DEFAULT_BILLING_PRICES };
  }
  const row = await prisma.sealosRegion.findUnique({
    where: { id: regionId },
    select: {
      priceCpu: true,
      priceMemory: true,
      priceStorage: true,
      pricePort: true,
    },
  });
  if (!row) return { ...DEFAULT_BILLING_PRICES };
  return normalizeBillingPrices({
    cpu: row.priceCpu,
    memory: row.priceMemory,
    storage: row.priceStorage,
    port: row.pricePort,
  });
}

/** 按沙箱所属区域取单价。 */
export async function getBillingPricesForSandbox(
  sandboxId: string,
): Promise<BillingPrices> {
  const record = await prisma.sandboxRecord.findUnique({
    where: { sandboxId },
    select: { regionId: true },
  });
  return getBillingPrices(record?.regionId);
}
