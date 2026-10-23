/** 广州 G（gzg）Sealos 公开单价，元。可用环境变量覆盖。 */

export type BillingPrices = {
  cpu: number;
  memory: number;
  storage: number;
  port: number;
};

const DEFAULT_PRICES: BillingPrices = {
  cpu: 0.01742,
  memory: 0.008786,
  storage: 0.000532,
  port: 0.007,
};

function parsePrice(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

/** 读取当前单价；写入用量段时快照，之后改价不影响已发生费用。 */
export function getBillingPrices(): BillingPrices {
  return {
    cpu: parsePrice(process.env.BILLING_PRICE_CPU, DEFAULT_PRICES.cpu),
    memory: parsePrice(process.env.BILLING_PRICE_MEMORY, DEFAULT_PRICES.memory),
    storage: parsePrice(
      process.env.BILLING_PRICE_STORAGE,
      DEFAULT_PRICES.storage,
    ),
    port: parsePrice(process.env.BILLING_PRICE_PORT, DEFAULT_PRICES.port),
  };
}
