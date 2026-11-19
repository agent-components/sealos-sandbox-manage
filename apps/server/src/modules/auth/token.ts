import type { IncomingMessage } from 'node:http';

export function readBearerToken(req: IncomingMessage) {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  const match = value ? /^Bearer\s+(\S+)$/i.exec(value) : null;
  return match?.[1] ?? null;
}