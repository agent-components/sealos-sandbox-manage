/** 沙箱容器内业务用户（SSH / MCP 执行共用）。 */
export const SANDBOX_CONTAINER_USER = "sandbox";

/** pods/exec 以 sandbox 用户执行（容器默认多为 root）。 */
export function asSandboxUser(command: string[]): string[] {
  return ["runuser", "-u", SANDBOX_CONTAINER_USER, "--", ...command];
}
