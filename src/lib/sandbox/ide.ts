import type { Sandbox } from "@/lib/sandbox/schema";

export type CursorIdeResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * 用沙箱 22 端口映射的公网地址（host:port）拼 Cursor Remote-SSH 深链。
 * 用户 `root`，密码由用户自行粘贴。
 */
export function cursorIdeUrl(sandbox: Sandbox): CursorIdeResult {
  if (sandbox.state !== "running") {
    return { ok: false, error: "请先开机" };
  }

  const ssh = sandbox.ports?.find((p) => p.number === 22);
  if (!ssh) {
    return { ok: false, error: "沙箱没有 22 端口，请在模板中添加 22/TCP 公网端口" };
  }

  const addr = ssh.publicAddress?.trim();
  if (!addr) {
    return { ok: false, error: "22 端口尚无公网地址，请确认已开启公网且沙箱已就绪" };
  }

  const bare = addr.replace(/^(ssh|tcp|https?):\/\//i, "").replace(/\/.*$/, "");
  const m = bare.match(/^(.*?):(\d+)$/);
  if (!m?.[1] || !m[2]) {
    return { ok: false, error: `无法解析 22 端口公网地址：${addr}` };
  }

  const host = m[1];
  const port = m[2];
  // `:` → =3A，避免被当成 URI 分隔
  return {
    ok: true,
    url: `cursor://vscode-remote/ssh-remote+root@${host}=3A${port}/`,
  };
}
