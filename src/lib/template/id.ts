import { customAlphabet } from "@/lib/sandbox/nanoid";

const alphabet = customAlphabet("abcdefghijklmnopqrstuvwxyz", 10);

/** 模板 ID：随机小写英文字母，如 tpl-abcdefghij */
export function createTemplateId(): string {
  return `tpl-${alphabet()}`;
}
