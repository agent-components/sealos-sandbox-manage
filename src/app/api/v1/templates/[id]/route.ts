import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { UpdateTemplateSchema } from "@/lib/template/schema";
import {
  deleteTemplate,
  getTemplate,
  updateTemplate,
} from "@/lib/template/store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await requireUser(req);
    const { id } = await ctx.params;
    const template = await getTemplate(id);
    if (!template) {
      return jsonOk({ error: "模板不存在" }, { status: 404 });
    }
    return jsonOk({ template });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireUser(req);
    const { id } = await ctx.params;
    const patch = UpdateTemplateSchema.parse(await req.json());
    const template = await updateTemplate(id, patch);
    if (!template) {
      return jsonOk({ error: "模板不存在" }, { status: 404 });
    }
    return jsonOk({ template });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireUser(req);
    const { id } = await ctx.params;
    const ok = await deleteTemplate(id);
    if (!ok) {
      return jsonOk({ error: "模板不存在" }, { status: 404 });
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
