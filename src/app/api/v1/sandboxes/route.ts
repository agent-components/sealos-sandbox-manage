import { NextRequest } from "next/server";
import { requireUser, resolveKubeconfig } from "@/lib/auth/resolve";
import { grantApiKeySandbox } from "@/lib/apikey/store";
import {
  runSandboxApiCall,
  touchSandboxActivity,
} from "@/lib/api/call-context";
import { parsePageQuery, slicePage } from "@/lib/api/page";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createSandboxId } from "@/lib/sandbox/id";
import { withSandboxIdle } from "@/lib/sandbox/idle";
import { sandboxFromRecord } from "@/lib/sandbox/from-record";
import {
  CreateSandboxSchema,
  IdleConfigSchema,
  SandboxStateSchema,
  TagsSchema,
  type SandboxState,
} from "@/lib/sandbox/schema";
import {
  deleteSandboxRecord,
  listSandboxRecords,
  saveSandboxRecord,
} from "@/lib/sandbox/record";
import { setSandboxTags, withSandboxTags } from "@/lib/sandbox/tags";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";
import { mapLaunchpadStatus, toSandbox } from "@/lib/sealos/map";
import { getTemplate, listTemplates } from "@/lib/template/store";

/** 从 Sealos 拉取应用状态；列表中其余字段来自数据库。 */
async function loadSealosStates(
  kubeconfig: string
): Promise<Map<string, SandboxState>> {
  const client = createLaunchpadClient({ kubeconfig });
  const apps = await client.listApps();
  return new Map(apps.map((app) => [app.name, mapLaunchpadStatus(app.status)]));
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
    const text = (req.nextUrl.searchParams.get("keyword") ?? "")
      .trim()
      .toLowerCase();
    const templateId =
      req.nextUrl.searchParams.get("templateId")?.trim() || undefined;
    const stateRaw = req.nextUrl.searchParams.get("state")?.trim() || undefined;
    const page = parsePageQuery(req.nextUrl.searchParams);

    return await runSandboxApiCall({
      req,
      tool: "listSandboxes",
      method: "GET",
      path: "/sandboxes",
      arguments: {
        ...(tagQuery.length ? { tag: tagQuery } : {}),
        ...(keyword.length ? { q: keyword.join(" ") } : {}),
        ...(text ? { keyword: text } : {}),
        ...(stateRaw ? { state: stateRaw } : {}),
        ...(templateId ? { templateId } : {}),
        current: page.current,
        ...(page.pageSize != null ? { pageSize: page.pageSize } : {}),
      },
      run: async () => {
        const state = stateRaw ? SandboxStateSchema.parse(stateRaw) : undefined;
        const user = await requireUser();
        const tags = tagQuery.length > 0 ? TagsSchema.parse(tagQuery) : [];

        const records = await listSandboxRecords({
          owner: user.username,
          allowedIds: user.apiKeyId ? user.sandboxIds ?? [] : null,
          tags,
          tagTerms: keyword,
          templateId,
          keyword: text || undefined,
        });

        const kubeconfig = await resolveKubeconfig();
        const states = await loadSealosStates(kubeconfig);

        const templates = await listTemplates();
        const templateById = new Map(templates.map((item) => [item.id, item]));

        let sandboxes = records.map((record) =>
          sandboxFromRecord(
            record,
            states.get(record.sandboxId) ?? "error",
            templateById.get(record.templateId)
          )
        );
        if (state) {
          sandboxes = sandboxes.filter((item) => item.state === state);
        }

        const paged = slicePage(sandboxes, page);
        const body = { list: paged.list, total: paged.total };
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
      arguments:
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {},
      run: async () => {
        const user = await requireUser();
        const kubeconfig = await resolveKubeconfig();
        const input = CreateSandboxSchema.parse(raw);

        const template = await getTemplate(input.templateId);
        if (!template) {
          const body = {
            error: `模板「${input.templateId}」不存在，请先创建模板`,
          };
          return {
            status: 400,
            result: body,
            value: jsonOk(body, { status: 400 }),
          };
        }

        const idleConfig = IdleConfigSchema.parse({
          autoShutdown: input.autoShutdown ?? template.autoShutdown ?? false,
          idleMinutes: input.idleMinutes ?? template.idleMinutes ?? 5,
        });

        const client = createLaunchpadClient({ kubeconfig });
        const id = input.name ?? createSandboxId();
        const app = await client.createAppFromTemplate({
          name: id,
          template,
          resources: {
            cpu: input.cpu,
            memoryGi: input.memoryGi,
            diskGi: input.diskGi,
          },
          env: input.env,
        });
        try {
          await saveSandboxRecord(user.username, id, template.id, idleConfig);
          await setSandboxTags(user.username, id, input.tags);
          if (user.apiKeyId) {
            const granted = await grantApiKeySandbox(
              user.apiKeyId,
              user.username,
              id
            );
            if (!granted) {
              throw new Error("令牌不存在，无法授予沙箱权限");
            }
          }
        } catch (error) {
          await client.deleteApp(id).catch(() => undefined);
          await deleteSandboxRecord(id).catch(() => undefined);
          throw error;
        }
        const [sandbox] = await withSandboxIdle(
          user.username,
          await withSandboxTags(user.username, [toSandbox(app, template.id)])
        );
        await touchSandboxActivity(id);
        const body = { sandbox };
        return {
          status: 201,
          result: body,
          value: jsonOk(body, { status: 201 }),
        };
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
