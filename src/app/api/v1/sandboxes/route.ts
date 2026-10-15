import { NextRequest } from "next/server";
import { requireUser, resolveKubeconfig } from "@/lib/auth/resolve";
import { filterAppsByApiKey } from "@/lib/apikey/access";
import { grantApiKeySandbox } from "@/lib/apikey/store";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createSandboxId } from "@/lib/sandbox/id";
import { CreateSandboxSchema, TagsSchema } from "@/lib/sandbox/schema";
import { isOwnedBy } from "@/lib/sandbox/ownership";
import {
  deleteSandboxTags,
  findSandboxIdsByTagQuery,
  findSandboxIdsByTags,
  setSandboxTags,
  withSandboxTags,
} from "@/lib/sandbox/tags";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";
import { toSandbox } from "@/lib/sealos/map";
import { getTemplate } from "@/lib/template/store";

function intersectIds(current: Set<string> | null, next: string[]): Set<string> {
  if (!current) return new Set(next);
  const allowed = new Set(next);
  return new Set([...current].filter((id) => allowed.has(id)));
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const kubeconfig = await resolveKubeconfig();
    const client = createLaunchpadClient({ kubeconfig });
    const apps = await client.listApps();
    let owned = filterAppsByApiKey(
      user,
      apps.filter((app) => isOwnedBy(app, user.username)),
    );

    const tagQuery = req.nextUrl.searchParams
      .getAll("tag")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
    const tags = tagQuery.length > 0 ? TagsSchema.parse(tagQuery) : [];

    const keyword = (req.nextUrl.searchParams.get("q") ?? "")
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    let matchedIds: Set<string> | null = null;
    if (tags.length > 0) {
      matchedIds = intersectIds(
        matchedIds,
        await findSandboxIdsByTags(user.username, tags),
      );
    }
    if (keyword.length > 0) {
      matchedIds = intersectIds(
        matchedIds,
        await findSandboxIdsByTagQuery(user.username, keyword),
      );
    }
    if (matchedIds) {
      owned = owned.filter((app) => matchedIds.has(app.name));
    }

    const sandboxes = await withSandboxTags(
      user.username,
      owned.map(toSandbox),
    );
    return jsonOk({ sandboxes });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const kubeconfig = await resolveKubeconfig();
    const input = CreateSandboxSchema.parse(await req.json().catch(() => ({})));

    const template = await getTemplate(input.templateId);
    if (!template) {
      return jsonOk(
        { error: `模板「${input.templateId}」不存在，请先创建模板` },
        { status: 400 },
      );
    }

    const client = createLaunchpadClient({ kubeconfig });
    const id = input.name ?? createSandboxId();
    const app = await client.createAppFromTemplate({
      name: id,
      owner: user.username,
      template,
      resources: {
        cpu: input.cpu,
        memoryGi: input.memoryGi,
        diskGi: input.diskGi,
      },
      env: input.env,
    });
    try {
      await setSandboxTags(user.username, id, input.tags);
      if (user.apiKeyId) {
        const granted = await grantApiKeySandbox(user.apiKeyId, user.username, id);
        if (!granted) {
          throw new Error("API Key 不存在，无法授予沙箱权限");
        }
      }
    } catch (error) {
      await client.deleteApp(id).catch(() => undefined);
      await deleteSandboxTags(user.username, id).catch(() => undefined);
      throw error;
    }
    const [sandbox] = await withSandboxTags(user.username, [toSandbox(app)]);
    return jsonOk({ sandbox }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
