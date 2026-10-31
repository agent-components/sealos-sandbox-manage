import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { RegionIdSchema } from "@/lib/sealos/region-catalog";
import { setDefaultRegion } from "@/lib/sealos/regions";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const regionId = RegionIdSchema.parse(id);
    const region = await setDefaultRegion(regionId);
    return jsonOk({ region });
  } catch (error) {
    return jsonError(error);
  }
}
