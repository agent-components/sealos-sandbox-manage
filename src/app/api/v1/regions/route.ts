import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { listRegionsPublic } from "@/lib/sealos/regions";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const list = await listRegionsPublic();
    return jsonOk({ list });
  } catch (error) {
    return jsonError(error);
  }
}
