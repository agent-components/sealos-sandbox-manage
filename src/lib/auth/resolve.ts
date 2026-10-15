import { readFileSync, existsSync } from "fs";
import { AuthError } from "@/lib/sealos/errors";
import { getSealosConfig } from "@/lib/sealos/config";
import { readUserSession } from "@/lib/auth/session";

/** 从 SEALOS_KUBECONFIG_PATH 读取服务端 kubeconfig。 */
export async function resolveKubeconfig(): Promise<string> {
  const { kubeconfigPath } = getSealosConfig();
  if (!existsSync(kubeconfigPath)) {
    throw new AuthError(`未找到 SEALOS_KUBECONFIG_PATH：${kubeconfigPath}`);
  }
  return readFileSync(kubeconfigPath, "utf8");
}

/** 要求已登录的平台用户（会话 cookie）。 */
export async function requireUser(): Promise<{ username: string }> {
  const session = await readUserSession();
  if (!session) {
    throw new AuthError("请先登录");
  }
  return session;
}
