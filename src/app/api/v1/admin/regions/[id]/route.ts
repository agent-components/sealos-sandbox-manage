import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { RegionIdSchema } from "@/lib/sealos/region-catalog";
import {
  clearRegionConfig,
  upsertRegionConfig,
} from "@/lib/sealos/regions";

const PriceSchema = z.number().finite().min(0);

const PutBodySchema = z.object({
  launchpadBase: z.string().min(1, "请填写 Launchpad 地址"),
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

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const regionId = RegionIdSchema.parse(id);
    const body = PutBodySchema.parse(await req.json());
    const region = await upsertRegionConfig(regionId, {
      launchpadBase: body.launchpadBase,
      kubeconfig: body.kubeconfig,
      prices: body.prices,
    });
    return jsonOk({ region });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const regionId = RegionIdSchema.parse(id);
    const region = await clearRegionConfig(regionId);
    return jsonOk({ region });
  } catch (error) {
    return jsonError(error);
  }
}
