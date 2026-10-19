import { randomBytes } from "crypto";

const PREFIX = "sandbox_";
/** 列表接口只返回这段前缀，更长的部分用 *** 代替。 */
const VISIBLE_KEY_LENGTH = 12;

/** 明文密钥：sandbox_ + 32 位 base64url，原样入库。列表里只返回打码结果。 */
export function createApiKeySecret(): string {
  return `${PREFIX}${randomBytes(24).toString("base64url")}`;
}

export function maskApiKeySecret(key: string): string {
  if (key.length <= VISIBLE_KEY_LENGTH) return key;
  return `${key.slice(0, VISIBLE_KEY_LENGTH)}***`;
}

export function isApiKeySecret(value: string): boolean {
  const prefixed = value.startsWith(PREFIX);
  return prefixed && value.length >= 20;
}
