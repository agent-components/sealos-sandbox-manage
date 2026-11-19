import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function isInside(root: string, target: string) {
  return target === root || target.startsWith(root.endsWith(sep) ? root : root + sep);
}

export function servePublic(root: string, req: IncomingMessage, res: ServerResponse) {
  if (!existsSync(root)) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return true;
  }

  let filePath = resolve(root, pathname.replace(/^[/\\]+/, ''));
  if (!isInside(root, filePath)) {
    res.writeHead(403).end();
    return true;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    if (extname(pathname)) {
      res.writeHead(404).end();
      return true;
    }
    filePath = join(root, 'index.html');
    if (!existsSync(filePath)) return false;
  }

  res.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  createReadStream(filePath).pipe(res);
  return true;
}