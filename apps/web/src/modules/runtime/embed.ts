/** 是否作为 iframe 子应用嵌入（跨域时访问 top 会抛错，也视为嵌入）。 */
export function isEmbeddedApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export type AppMode = 'embedded' | 'standalone';

export function getAppMode(): AppMode {
  return isEmbeddedApp() ? 'embedded' : 'standalone';
}
