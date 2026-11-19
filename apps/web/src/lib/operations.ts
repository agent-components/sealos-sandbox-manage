import { mcpToolLabel } from '@/lib/mcp/tools';

/** 调用日志中的 operation 展示名（兼容历史 tool 名称）。 */
export function operationLabel(name: string) {
  return mcpToolLabel(name);
}