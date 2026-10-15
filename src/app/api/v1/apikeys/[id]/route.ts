import { NextRequest } from "next/server";
import { requireSessionUser } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { deleteApiKey } from "@/lib/apikey/store";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireSessionUser();
    const { id } = await ctx.params;
    const ok = await deleteApiKey(id, user.username);
    if (!ok) {
      return jsonOk({ error: "API Key 不存在" }, { status: 404 });
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
