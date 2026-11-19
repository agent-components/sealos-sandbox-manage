import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../src');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

for (const file of walk(root)) {
  let text = fs.readFileSync(file, 'utf8');
  const orig = text;
  text = text.replace(/^["']use client["'];\s*\n?/gm, '');
  text = text.replace(/from "@\/([^"]+)"/g, 'from "@/$1"');
  if (text !== orig) fs.writeFileSync(file, text);
}