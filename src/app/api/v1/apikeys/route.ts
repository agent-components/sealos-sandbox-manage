import { NextRequest } from "next/server";
import { requireSessionUser } from "@/lib/auth/resolve";
import { parsePageQuery, slicePage } from "@/lib/api/page";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createApiKeyId } from "@/lib/apikey/id";
import { CreateApiKeySchema, MAX_API_KEYS_PER_USER } from "@/lib/apikey/schema";
import { createApiKeySecret } from "@/lib/apikey/secret";
import {
  apiKeyIdExists,
  countApiKeys,
  createApiKey,
  listApiKeys,
} from "@/lib/apikey/store";
import { findUnownedSandboxIds } from "@/lib/sandbox/owned";

export async function GET(req: NextRequest) {
  try {
    const user = await requireSessionUser();
    const page = parsePageQuery(req.nextUrl.searchParams);
    const keyword = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    let apiKeys = await listApiKeys(user.username);
    if (keyword) {
      apiKeys = apiKeys.filter(
        (item) =>
          item.name.toLowerCase().includes(keyword) ||
          item.key.toLowerCase().includes(keyword),
      );
    }
    return jsonOk(slicePage(apiKeys, page));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSessionUser();
    const input = CreateApiKeySchema.parse(await req.json());

    const count = await countApiKeys(user.username);
    if (count >= MAX_API_KEYS_PER_USER) {
      return jsonOk(
        { error: `每个用户最多创建 ${MAX_API_KEYS_PER_USER} 个令牌` },
        { status: 400 },
      );
    }

    let id = createApiKeyId();
    for (let i = 0; i < 5; i++) {
      if (!(await apiKeyIdExists(id))) break;
      id = createApiKeyId();
    }
    if (await apiKeyIdExists(id)) {
      return jsonOk({ error: "无法生成唯一令牌 ID，请重试" }, { status: 500 });
    }

    const missing = await findUnownedSandboxIds(user.username, input.sandboxIds);
    if (missing.length > 0) {
      return jsonOk(
        { error: `沙箱不存在或无权访问：${missing.join("、")}` },
        { status: 400 },
      );
    }

    const apiKey = await createApiKey({
      id,
      name: input.name,
      username: user.username,
      key: createApiKeySecret(),
      sandboxIds: input.sandboxIds,
      allowedTools: input.allowedTools,
    });
    return jsonOk({ apiKey }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
