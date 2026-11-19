import {
  defaultBillingRange,
  getBillingReport,
} from '../../lib/billing/report';

function parseInstant(
  raw: string | undefined,
  label: string,
): { ok: true; value: Date | null } | { ok: false; error: string } {
  if (raw == null || raw.trim() === '') return { ok: true, value: null };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: `${label} 不是有效时间` };
  }
  return { ok: true, value: date };
}

export type BillingQueryResult =
  | { ok: true; report: Awaited<ReturnType<typeof getBillingReport>> }
  | { ok: false; status: number; error: string };

export async function getBillingReportForUser(
  username: string,
  query: { from?: string; to?: string },
): Promise<BillingQueryResult> {
  const defaults = defaultBillingRange();
  const fromParsed = parseInstant(query.from, 'from');
  if (!fromParsed.ok) {
    return { ok: false, status: 400, error: fromParsed.error };
  }
  const toParsed = parseInstant(query.to, 'to');
  if (!toParsed.ok) {
    return { ok: false, status: 400, error: toParsed.error };
  }
  const from = fromParsed.value ?? defaults.from;
  const to = toParsed.value ?? defaults.to;

  if (to <= from) {
    return { ok: false, status: 400, error: 'to 必须晚于 from' };
  }

  const report = await getBillingReport(username, from, to);
  return { ok: true, report };
}