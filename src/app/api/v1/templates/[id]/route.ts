import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { AuthError } from "@/lib/sealos/errors";
import { UpdateTemplateSchema } from "@/lib/template/schema";
import {
  deleteTemplate,
  getTemplate,
  getVisibleTemplate,
  updateTemplate,
} from "@/lib/template/store";

function assertOwner(template: { owner?: string }, username: string) {
  if (template.owner !== username) {
    throw new AuthError("只有创建人可以修改模板", 403);
  }
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const template = await getVisibleTemplate(id, user.username, {
      redact: true,
    });
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
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const current = await getTemplate(id);
    if (!current) {
      return jsonOk({ error: "模板不存在" }, { status: 404 });
    }
    assertOwner(current, user.username);
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
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const current = await getTemplate(id);
    if (!current) {
      return jsonOk({ error: "模板不存在" }, { status: 404 });
    }
    assertOwner(current, user.username);
    const ok = await deleteTemplate(id);
    if (!ok) {
      return jsonOk({ error: "模板不存在" }, { status: 404 });
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
