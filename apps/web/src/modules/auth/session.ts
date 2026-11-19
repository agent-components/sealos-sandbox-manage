const tokenStorageKey = 'sandbox_user_token';

export type Session = {
  username: string;
  displayName: string;
  role: 'ADMIN' | 'USER';
};

export function readToken() {
  try {
    return localStorage.getItem(tokenStorageKey);
  } catch {
    return null;
  }
}

export function writeToken(token: string) {
  localStorage.setItem(tokenStorageKey, token);
}

export function clearToken() {
  localStorage.removeItem(tokenStorageKey);
}