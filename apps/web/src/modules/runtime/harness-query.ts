const SSO_PARAM = 'harness_sso';
const THEME_PARAM = 'theme';

export function readHarnessSsoCode(): string | null {
  if (typeof window === 'undefined') return null;
  const code = new URLSearchParams(window.location.search).get(SSO_PARAM)?.trim();
  return code || null;
}

export function readHarnessThemeId(): string | null {
  if (typeof window === 'undefined') return null;
  const theme = new URLSearchParams(window.location.search).get(THEME_PARAM)?.trim();
  return theme || null;
}

/** 兑换成功后从地址栏去掉票据，保留 theme 与其它参数。 */
export function stripHarnessSsoFromUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SSO_PARAM)) return;
  url.searchParams.delete(SSO_PARAM);
  const qs = url.searchParams.toString();
  const next = `${url.pathname}${qs ? `?${qs}` : ''}${url.hash}`;
  window.history.replaceState(null, '', next);
}
