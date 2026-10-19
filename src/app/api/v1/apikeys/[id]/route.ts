import { NextRequest } from "next/server";
import { requireSessionUser } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { UpdateApiKeySchema } from "@/lib/apikey/schema";
import { deleteApiKey, updateApiKey } from "@/lib/apikey/store";
import { findUnownedSandboxIds } from "@/lib/sandbox/owned";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireSessionUser();
    const { id } = await ctx.params;
    const input = UpdateApiKeySchema.parse(await req.json());
    if (input.sandboxIds !== undefined) {
      const missing = await findUnownedSandboxIds(user.username, input.sandboxIds);
      if (missing.length > 0) {
        return jsonOk(
          { error: `沙箱不存在或无权访问：${missing.join("、")}` },
          { status: 400 },
        );
      }
    }
    const apiKey = await updateApiKey(id, user.username, input);
    if (!apiKey) {
      return jsonOk({ error: "令牌不存在" }, { status: 404 });
    }
    return jsonOk({ apiKey });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireSessionUser();
    const { id } = await ctx.params;
    const ok = await deleteApiKey(id, user.username);
    if (!ok) {
      return jsonOk({ error: "令牌不存在" }, { status: 404 });
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
