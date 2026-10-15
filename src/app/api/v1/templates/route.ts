import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { CreateTemplateSchema } from "@/lib/template/schema";
import {
  createTemplate,
  ensureDefaultTemplate,
  getTemplate,
  listTemplates,
} from "@/lib/template/store";

export async function GET() {
  try {
    await requireUser();
    await ensureDefaultTemplate();
    const templates = await listTemplates();
    return jsonOk({ templates });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const input = CreateTemplateSchema.parse(await req.json());
    const existing = await getTemplate(input.id);
    if (existing) {
      return jsonOk({ error: `模板 ID「${input.id}」已存在` }, { status: 409 });
    }
    const template = await createTemplate(input);
    return jsonOk({ template }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
