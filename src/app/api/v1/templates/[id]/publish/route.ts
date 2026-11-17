import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { publishTemplate } from "@/lib/template/store";

type Ctx = { params: Promise<{ id: string }> };

/** 把私有模板公开：复制一条新的公共模板，原模板不变。 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const template = await publishTemplate(id, user.username);
    return jsonOk({ template }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
