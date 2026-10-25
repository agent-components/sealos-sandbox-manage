import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/resolve";
import { parsePageQuery } from "@/lib/api/page";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createTemplateId } from "@/lib/template/id";
import { CreateTemplateSchema } from "@/lib/template/schema";
import {
  createTemplate,
  getTemplate,
  listTemplatesPage,
} from "@/lib/template/store";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const page = parsePageQuery(req.nextUrl.searchParams);
    const q = req.nextUrl.searchParams.get("q")?.trim() || undefined;
    return jsonOk(
      await listTemplatesPage({
        q,
        current: page.current,
        pageSize: page.pageSize,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    const input = CreateTemplateSchema.parse(await req.json());

    let id = input.id?.trim() || createTemplateId();
    for (let i = 0; i < 5; i++) {
      const existing = await getTemplate(id);
      if (!existing) break;
      if (input.id?.trim()) {
        return jsonOk({ error: `模板 ID「${id}」已存在` }, { status: 409 });
      }
      id = createTemplateId();
    }
    if (await getTemplate(id)) {
      return jsonOk({ error: "无法生成唯一模板 ID，请重试" }, { status: 500 });
    }

    const template = await createTemplate({ ...input, id });
    return jsonOk({ template }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
