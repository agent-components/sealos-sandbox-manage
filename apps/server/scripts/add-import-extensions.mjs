import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '../dist');
const specifier = /\b(?:from|import)\s*(?:\(\s*)?(['"])(\.[^'"]+)\1/g;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

function rewrite(code, file) {
  return code.replace(specifier, (full, quote, spec) => {
    if (/[?#]/.test(spec)) {
      throw new Error(`${file} 里的导入带查询参数，无法补后缀: ${spec}`);
    }
    if (/\.(?:js|mjs|cjs|json|node)$/.test(spec)) return full;
    const quoted = `${quote}${spec}${quote}`;
    return full.replace(quoted, `${quote}${spec}.js${quote}`);
  });
}

const files = await walk(dist);
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const next = rewrite(source, file);
  if (next !== source) await writeFile(file, next);
}
