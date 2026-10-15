import { customAlphabet } from "@/lib/sandbox/nanoid";

const alphabet = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);

/** K8s 合法名称：bx-xxxxxxxxxx */
export function createSandboxId(): string {
  return `bx-${alphabet()}`;
}
