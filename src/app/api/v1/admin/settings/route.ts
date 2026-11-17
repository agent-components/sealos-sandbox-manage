import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api/response";
import { requireAdmin } from "@/lib/auth/resolve";
import { getSystemSettings, setLogRetentionDays } from "@/lib/settings/store";

const bodySchema = z.object({
  logRetentionDays: z.number().int().min(1).max(3650).nullable(),
});

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return jsonOk({ settings: await getSystemSettings() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = bodySchema.parse(await req.json());
    const settings = await setLogRetentionDays(body.logRetentionDays);
    return jsonOk({ settings });
  } catch (error) {
    return jsonError(error);
  }
}
