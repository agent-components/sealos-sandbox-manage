import { customAlphabet } from "@/lib/sandbox/nanoid";

const alphabet = customAlphabet("abcdefghijklmnopqrstuvwxyz", 10);

/** API Key ID：随机小写英文字母，如 key-abcdefghij */
export function createApiKeyId(): string {
  return `key-${alphabet()}`;
}
