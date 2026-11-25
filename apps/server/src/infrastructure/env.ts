import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'),
  quiet: true,
});

export function requireDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return connectionString;
}

/**
 * Harness Admin 根地址（无尾斜杠）。可选：仅嵌入子应用做 SSO 兑换时需要；
 * 独立运行可不配置。
 */
export function getHarnessOrigin(): string | null {
  const origin = process.env.HARNESS_ORIGIN?.trim().replace(/\/+$/, '');
  return origin || null;
}

/**
 * 本组件在 Harness Admin 中的组件标识。嵌入子应用做 SSO 兑换时必填，
 * 用于校验宿主票据确实签发给本组件。
 */
export function getHarnessComponentId(): string | null {
  const componentId = process.env.HARNESS_COMPONENT_ID?.trim();
  return componentId || null;
}

/**
 * 独立运行时由本服务提供 MCP（POST /api/mcp）。
 * 默认关闭。嵌入 Harness 时由宿主提供工具调用，保持关闭即可。
 */
export function isMcpEnabled(): boolean {
  const raw = process.env.MCP_ENABLED?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}