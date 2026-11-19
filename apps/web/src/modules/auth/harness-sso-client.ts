import { trpc } from '../../api/trpc';
import { readHarnessSsoCode, stripHarnessSsoFromUrl } from '../runtime/harness-query';
import { writeToken, type Session } from './session';

type SsoResult = { user: Session; token: string };

/** StrictMode 双挂载：URL 清掉后仍能拿到同一票据 / 同一 inflight。 */
let capturedCode: string | null = null;
let inflight: Promise<SsoResult> | null = null;
let lastSuccess: SsoResult | null = null;

export function takeHarnessSsoCode(): string | null {
  const fromUrl = readHarnessSsoCode();
  if (fromUrl) {
    capturedCode = fromUrl;
    stripHarnessSsoFromUrl();
  }
  return capturedCode;
}

export function peekHarnessSsoInflight(): Promise<SsoResult> | null {
  return inflight;
}

export function peekHarnessSsoSuccess(): SsoResult | null {
  return lastSuccess;
}

export function exchangeHarnessSsoOnce(code: string): Promise<SsoResult> {
  if (inflight) return inflight;
  if (lastSuccess) return Promise.resolve(lastSuccess);

  inflight = trpc.auth.harnessSso
    .mutate({ code }, { context: { silent: true } })
    .then((result) => {
      writeToken(result.token);
      lastSuccess = result;
      capturedCode = null;
      return result;
    })
    .catch((error) => {
      inflight = null;
      throw error;
    });

  return inflight;
}
