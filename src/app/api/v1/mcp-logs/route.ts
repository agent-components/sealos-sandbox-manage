import { NextRequest } from "next/server";
import { requireSessionUser } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { listMcpLogs } from "@/lib/mcp/logs";

function parseTime(value: string | null): Date | undefined {
  if (!value?.trim()) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireSessionUser();
    const params = req.nextUrl.searchParams;
    const tool = params.get("tool")?.trim() || undefined;
    const apiKeyId = params.get("apiKeyId")?.trim() || undefined;
    const from = parseTime(params.get("from"));
    const to = parseTime(params.get("to"));
    const pageRaw = Number(params.get("page") ?? "1");
    const page = Number.isFinite(pageRaw) ? pageRaw : 1;
    const pageSizeParam = params.get("pageSize");
    const limitParam = params.get("limit");
    const sized = pageSizeParam != null || limitParam != null;
    const sizeRaw = Number(pageSizeParam ?? limitParam ?? (sized ? "20" : "100"));
    const pageSize = Number.isFinite(sizeRaw) ? sizeRaw : sized ? 20 : 100;

    if (params.get("from") && !from) {
      return jsonOk({ error: "from 时间格式无效" }, { status: 400 });
    }
    if (params.get("to") && !to) {
      return jsonOk({ error: "to 时间格式无效" }, { status: 400 });
    }
    if (from && to && from.getTime() > to.getTime()) {
      return jsonOk({ error: "时间范围起点不能晚于终点" }, { status: 400 });
    }

    const result = await listMcpLogs(user.username, {
      page,
      pageSize,
      tool,
      apiKeyId,
      from,
      to,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
