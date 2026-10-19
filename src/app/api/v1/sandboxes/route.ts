import { NextRequest } from "next/server";
import { requireUser, resolveKubeconfig } from "@/lib/auth/resolve";
import { filterAppsByApiKey } from "@/lib/apikey/access";
import { grantApiKeySandbox } from "@/lib/apikey/store";
import { runSandboxApiCall, touchSandboxActivity } from "@/lib/api/call-context";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createSandboxId } from "@/lib/sandbox/id";
import {
  deleteSandboxIdle,
  setSandboxIdleConfig,
  withSandboxIdle,
} from "@/lib/sandbox/idle";
import {
  CreateSandboxSchema,
  IdleConfigSchema,
  TagsSchema,
} from "@/lib/sandbox/schema";
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
    const tagQuery = req.nextUrl.searchParams
      .getAll("tag")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
    const keyword = (req.nextUrl.searchParams.get("q") ?? "")
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    return await runSandboxApiCall({
      req,
      tool: "listSandboxes",
      method: "GET",
      path: "/sandboxes",
      arguments: {
        ...(tagQuery.length ? { tag: tagQuery } : {}),
        ...(keyword.length ? { q: keyword.join(" ") } : {}),
      },
      run: async () => {
        const user = await requireUser();
        const kubeconfig = await resolveKubeconfig();
        const client = createLaunchpadClient({ kubeconfig });
        const apps = await client.listApps();
        let owned = filterAppsByApiKey(
          user,
          apps.filter((app) => isOwnedBy(app, user.username)),
        );

        const tags = tagQuery.length > 0 ? TagsSchema.parse(tagQuery) : [];

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

        const sandboxes = await withSandboxIdle(
          user.username,
          await withSandboxTags(user.username, owned.map(toSandbox)),
        );
        const body = { sandboxes };
        return { status: 200, result: body, value: jsonOk(body) };
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => ({}));
    return await runSandboxApiCall<Response>({
      req,
      tool: "createSandbox",
      method: "POST",
      path: "/sandboxes",
      arguments: raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {},
      run: async () => {
        const user = await requireUser();
        const kubeconfig = await resolveKubeconfig();
        const input = CreateSandboxSchema.parse(raw);

        const template = await getTemplate(input.templateId);
        if (!template) {
          const body = { error: `模板「${input.templateId}」不存在，请先创建模板` };
          return { status: 400, result: body, value: jsonOk(body, { status: 400 }) };
        }

        const idleConfig = IdleConfigSchema.parse({
          autoShutdown: input.autoShutdown ?? template.autoShutdown ?? false,
          idleMinutes: input.idleMinutes ?? template.idleMinutes ?? 5,
        });

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
          await setSandboxIdleConfig(user.username, id, idleConfig);
          if (user.apiKeyId) {
            const granted = await grantApiKeySandbox(user.apiKeyId, user.username, id);
            if (!granted) {
              throw new Error("令牌不存在，无法授予沙箱权限");
            }
          }
        } catch (error) {
          await client.deleteApp(id).catch(() => undefined);
          await deleteSandboxTags(user.username, id).catch(() => undefined);
          await deleteSandboxIdle(user.username, id).catch(() => undefined);
          throw error;
        }
        const [sandbox] = await withSandboxIdle(
          user.username,
          await withSandboxTags(user.username, [toSandbox(app)]),
        );
        await touchSandboxActivity(id);
        const body = { sandbox };
        return { status: 201, result: body, value: jsonOk(body, { status: 201 }) };
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
