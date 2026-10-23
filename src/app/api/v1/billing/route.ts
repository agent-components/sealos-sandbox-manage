import { NextRequest } from "next/server";
import { requireSessionUser } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  defaultBillingRange,
  getBillingReport,
} from "@/lib/billing/report";

function parseInstant(
  raw: string | null,
  label: string,
): { ok: true; value: Date | null } | { ok: false; error: string } {
  if (raw == null || raw.trim() === "") return { ok: true, value: null };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: `${label} 不是有效时间` };
  }
  return { ok: true, value: date };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireSessionUser();
    const defaults = defaultBillingRange();
    const fromParsed = parseInstant(req.nextUrl.searchParams.get("from"), "from");
    if (!fromParsed.ok) {
      return jsonOk({ error: fromParsed.error }, { status: 400 });
    }
    const toParsed = parseInstant(req.nextUrl.searchParams.get("to"), "to");
    if (!toParsed.ok) {
      return jsonOk({ error: toParsed.error }, { status: 400 });
    }
    const from = fromParsed.value ?? defaults.from;
    const to = toParsed.value ?? defaults.to;

    if (to <= from) {
      return jsonOk({ error: "to 必须晚于 from" }, { status: 400 });
    }

    const report = await getBillingReport(user.username, from, to);
    return jsonOk(report);
  } catch (error) {
    return jsonError(error);
  }
}
