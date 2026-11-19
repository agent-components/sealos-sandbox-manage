export class SealosApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "SealosApiError";
    this.status = status;
    this.details = details;
  }
}

export class AuthError extends Error {
  status: number;
  constructor(message = "未授权", status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}
