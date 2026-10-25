import { NextRequest } from "next/server";
import { requireSessionUser } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { getApiKeySecret } from "@/lib/apikey/store";

type Ctx = { params: Promise<{ id: string }> };

/** 复制密钥或 MCP 配置时取明文。列表接口只返回打码后的 key。 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireSessionUser(_req);
    const { id } = await ctx.params;
    const key = await getApiKeySecret(id, user.username);
    if (!key) {
      return jsonOk({ error: "令牌不存在" }, { status: 404 });
    }
    return jsonOk({ key });
  } catch (error) {
    return jsonError(error);
  }
}
