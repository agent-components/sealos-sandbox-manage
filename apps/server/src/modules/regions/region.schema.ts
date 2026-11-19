import { z } from 'zod';
import { RegionIdSchema } from '../../lib/sealos/region-catalog';

const PriceSchema = z.number().finite().min(0);

export const upsertRegionSchema = z.object({
  id: RegionIdSchema,
  launchpadBase: z.string().min(1, '请填写 Launchpad 地址'),
  kubeconfig: z.string().optional().nullable(),
  prices: z
    .object({
      cpu: PriceSchema,
      memory: PriceSchema,
      storage: PriceSchema,
      port: PriceSchema,
    })
    .optional()
    .nullable(),
});

export const regionIdParamSchema = z.object({
  id: RegionIdSchema,
});