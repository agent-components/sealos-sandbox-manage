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
    const limitRaw = Number(params.get("limit") ?? "100");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 100;

    if (params.get("from") && !from) {
      return jsonOk({ error: "from 时间格式无效" }, { status: 400 });
    }
    if (params.get("to") && !to) {
      return jsonOk({ error: "to 时间格式无效" }, { status: 400 });
    }
    if (from && to && from.getTime() > to.getTime()) {
      return jsonOk({ error: "时间范围起点不能晚于终点" }, { status: 400 });
    }

    const logs = await listMcpLogs(user.username, {
      limit,
      tool,
      apiKeyId,
      from,
      to,
    });
    return jsonOk({ logs });
  } catch (error) {
    return jsonError(error);
  }
}
