import { bindAuthRequest } from '../auth/resolve';

/** 让依赖 AsyncLocalStorage 的 lib 在同一次请求里读到 Bearer。 */
export function bindBearerToken(token: string | null) {
  const headers = new Headers();
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }
  bindAuthRequest(new Request('http://boat.local/', { headers }));
}