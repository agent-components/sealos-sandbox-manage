import {
  getCallLog,
  listCallLogs,
  readCallLogResult,
} from '../../lib/logs/store';

function parseTime(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export type ListCallLogsInput = {
  operation?: string;
  from?: string;
  to?: string;
  current?: number;
  pageSize?: number;
};

export async function listUserCallLogs(username: string, input: ListCallLogsInput) {
  const from = parseTime(input.from);
  const to = parseTime(input.to);

  if (input.from && !from) {
    return { ok: false as const, status: 400, error: 'from 时间格式无效' };
  }
  if (input.to && !to) {
    return { ok: false as const, status: 400, error: 'to 时间格式无效' };
  }
  if (from && to && from.getTime() > to.getTime()) {
    return { ok: false as const, status: 400, error: '时间范围起点不能晚于终点' };
  }

  const result = await listCallLogs(username, {
    page: input.current,
    pageSize: input.pageSize ?? 100,
    operation: input.operation,
    from,
    to,
  });
  return { ok: true as const, result };
}

export async function getUserCallLog(username: string, id: string) {
  const log = await getCallLog(username, id);
  if (!log) {
    return { ok: false as const, status: 404, error: '日志不存在' };
  }

  let result: unknown = null;
  let resultLoadError: string | null = null;
  if (log.resultKey) {
    try {
      result = await readCallLogResult(log.resultKey);
    } catch (error) {
      resultLoadError =
        error instanceof Error ? error.message : '结果读取失败';
    }
  } else if (log.resultError) {
    resultLoadError = log.resultError;
  }

  return { ok: true as const, log, result, resultLoadError };
}