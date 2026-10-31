import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { listRegionsAdmin } from "@/lib/sealos/regions";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const list = await listRegionsAdmin();
    return jsonOk({ list });
  } catch (error) {
    return jsonError(error);
  }
}
