import { requireSessionUser } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { getMcpLog, readMcpLogResult } from "@/lib/mcp/logs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireSessionUser(_req);
    const { id } = await ctx.params;
    const log = await getMcpLog(user.username, id);
    if (!log) {
      return jsonOk({ error: "日志不存在" }, { status: 404 });
    }

    let result: unknown = null;
    let resultLoadError: string | null = null;
    if (log.resultKey) {
      try {
        result = await readMcpLogResult(log.resultKey);
      } catch (error) {
        resultLoadError =
          error instanceof Error ? error.message : "结果读取失败";
      }
    } else if (log.resultError) {
      resultLoadError = log.resultError;
    }

    return jsonOk({ log, result, resultLoadError });
  } catch (error) {
    return jsonError(error);
  }
}
