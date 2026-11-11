import type { Sandbox } from "@/lib/sandbox/schema";

export const SANDBOX_DESKTOP_PORT = 6080;

/** 沙箱桌面分辨率。iframe 按这个尺寸布局，noVNC 才会把远端改成 1920×1080。 */
export const SANDBOX_DESKTOP_WIDTH = 1920;
export const SANDBOX_DESKTOP_HEIGHT = 1080;

export type SandboxDesktopResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const NOVNC_TOKEN_ENV = "NOVNC_TOKEN";

/** 取公网地址的协议和主机，丢掉原路径。 */
function desktopOrigin(addr: string): string | null {
  const value = addr.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value)
    ? value
    : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * 用 6080 公网地址和沙箱环境变量 NOVNC_TOKEN 拼 noVNC 入口。
 * 形如 `https://host/vnc_lite.html?autoconnect=1&reconnect=1&resize=remote&path=websockify%3Ftoken%3D...`
 * `resize=remote` 让远端跟着 iframe 视口变化；视口固定为 1920×1080。
 */
export function sandboxDesktopUrl(sandbox: Sandbox): SandboxDesktopResult {
  if (sandbox.state !== "running") {
    return { ok: false, error: "请先开机" };
  }

  const desktop = sandbox.ports?.find((port) => port.number === SANDBOX_DESKTOP_PORT);
  if (!desktop) {
    return {
      ok: false,
      error: "沙箱没有 6080 端口，请在模板中添加 6080 公网端口",
    };
  }

  const addr = desktop.publicAddress?.trim();
  if (!addr) {
    return {
      ok: false,
      error: "6080 端口尚无公网地址，请确认已开启公网且沙箱已就绪",
    };
  }

  const origin = desktopOrigin(addr);
  if (!origin) {
    return { ok: false, error: `无法解析 6080 端口公网地址：${addr}` };
  }

  const token = sandbox.env
    ?.find((item) => item.name === NOVNC_TOKEN_ENV)
    ?.value?.trim();
  if (!token) {
    return { ok: false, error: "沙箱未配置环境变量 NOVNC_TOKEN" };
  }

  const url = new URL("/vnc_lite.html", origin);
  url.searchParams.set("autoconnect", "1");
  url.searchParams.set("reconnect", "1");
  url.searchParams.set("resize", "remote");
  url.searchParams.set("path", `websockify?token=${token}`);
  return { ok: true, url: url.href };
}
