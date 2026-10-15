import { randomBytes } from "crypto";

const PREFIX = "boat_";

/** 明文密钥：boat_ + 32 位 base64url，原样入库并长期可复制 */
export function createApiKeySecret(): string {
  return `${PREFIX}${randomBytes(24).toString("base64url")}`;
}

export function isApiKeySecret(value: string): boolean {
  return value.startsWith(PREFIX) && value.length >= 20;
}
