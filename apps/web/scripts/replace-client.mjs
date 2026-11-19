import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../src');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const importTrpc = `import { trpc } from '@/api/trpc';\n`;

for (const file of walk(root)) {
  if (file.includes('api/trpc.ts') || file.includes('api/errorLink.ts')) continue;
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes('sandboxClient') && !text.includes('@/lib/client')) continue;

  text = text.replace(
    /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/client["'];?\s*\n/g,
    (full, inner) => {
      const types = inner
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && s !== 'sandboxClient' && !s.startsWith('type sandboxClient'));
      const typeOnly = types.filter((s) => s.startsWith('type '));
      let block = importTrpc;
      if (typeOnly.length) {
        const names = typeOnly.map((t) => t.replace(/^type\s+/, ''));
        block += `import type { ${names.join(', ')} } from '@/modules/api/types';\n`;
      }
      return block;
    },
  );

  text = text.replace(/\bsandboxClient\.me\(\)/g, 'trpc.auth.me.query()');
  text = text.replace(/\bsandboxClient\.login\(/g, 'trpc.auth.login.mutate(');
  text = text.replace(/\bsandboxClient\.logout\(\)/g, 'trpc.auth.logout.mutate()');
  text = text.replace(/\bsandboxClient\.listSandboxes\(/g, 'trpc.sandboxes.list.query(');
  text = text.replace(/\bsandboxClient\.createSandbox\(/g, 'trpc.sandboxes.create.mutate(');
  text = text.replace(/\bsandboxClient\.getSandbox\(/g, 'trpc.sandboxes.get.query(');
  text = text.replace(
    /\bsandboxClient\.updateSandbox\(\s*([^,]+),\s*([^)]+)\)/g,
    'trpc.sandboxes.update.mutate({ id: $1, patch: $2 })',
  );
  text = text.replace(/\bsandboxClient\.syncSandboxFromTemplate\(/g, 'trpc.sandboxes.syncTemplate.mutate({ id: ');
  text = text.replace(/\bsandboxClient\.deleteSandbox\(/g, 'trpc.sandboxes.delete.mutate({ id: ');
  text = text.replace(/\bsandboxClient\.stopSandbox\(/g, 'trpc.sandboxes.stop.mutate({ id: ');
  text = text.replace(/\bsandboxClient\.resumeSandbox\(/g, 'trpc.sandboxes.resume.mutate({ id: ');
  text = text.replace(/\bsandboxClient\.getEphemeralDisk\(/g, 'trpc.sandboxes.ephemeralDisk.query({ id: ');
  text = text.replace(
    /\bsandboxClient\.runSandboxCommand\(\s*([^,]+),\s*([^)]+)\)/g,
    'trpc.sandboxes.runCommand.mutate({ id: $1, body: { command: $2 } })',
  );
  text = text.replace(/\bsandboxClient\.getSandboxLogs\(/g, 'trpc.sandboxes.logs.query(');
  text = text.replace(/\bsandboxClient\.listTemplates\(/g, 'trpc.templates.list.query(');
  text = text.replace(/\bsandboxClient\.getTemplate\(/g, 'trpc.templates.get.query(');
  text = text.replace(/\bsandboxClient\.createTemplate\(/g, 'trpc.templates.create.mutate(');
  text = text.replace(
    /\bsandboxClient\.updateTemplate\(\s*([^,]+),\s*([^)]+)\)/g,
    'trpc.templates.update.mutate({ id: $1, patch: $2 })',
  );
  text = text.replace(/\bsandboxClient\.deleteTemplate\(/g, 'trpc.templates.delete.mutate({ id: ');
  text = text.replace(/\bsandboxClient\.publishTemplate\(/g, 'trpc.templates.publish.mutate({ id: ');
  text = text.replace(/\bsandboxClient\.listMcpLogs\(/g, 'trpc.callLogs.list.query(');
  text = text.replace(/\bsandboxClient\.getMcpLog\(/g, 'trpc.callLogs.get.query(');
  text = text.replace(/\bsandboxClient\.getBilling\(/g, 'trpc.billing.get.query(');
  text = text.replace(/\bsandboxClient\.listRegions\(\)/g, 'trpc.regions.list.query()');
  text = text.replace(/\bsandboxClient\.listAdminRegions\(\)/g, 'trpc.admin.list.query()');
  text = text.replace(
    /\bsandboxClient\.upsertAdminRegion\(\s*([^,]+),\s*([^)]+)\)/g,
    'trpc.admin.upsert.mutate({ id: $1, ...$2 })',
  );
  text = text.replace(/\bsandboxClient\.clearAdminRegion\(/g, 'trpc.admin.clear.mutate({ id: ');
  text = text.replace(/\bsandboxClient\.setDefaultAdminRegion\(/g, 'trpc.admin.setDefault.mutate({ id: ');
  text = text.replace(/\bsandboxClient\.getAdminSettings\(\)/g, 'trpc.settings.get.query()');
  text = text.replace(/\bsandboxClient\.updateAdminSettings\(/g, 'trpc.settings.update.mutate(');

  // Fix syncTemplate/delete/stop/resume/ephemeralDisk/publish/deleteTemplate closing parens
  text = text.replace(
    /trpc\.sandboxes\.(syncTemplate|delete|stop|resume)\.mutate\(\{ id: ([^)]+)\)/g,
    'trpc.sandboxes.$1.mutate({ id: $2 })',
  );
  text = text.replace(
    /trpc\.sandboxes\.ephemeralDisk\.query\(\{ id: ([^)]+)\)/g,
    'trpc.sandboxes.ephemeralDisk.query({ id: $1 })',
  );
  text = text.replace(
    /trpc\.templates\.(delete|publish)\.mutate\(\{ id: ([^)]+)\)/g,
    'trpc.templates.$1.mutate({ id: $2 })',
  );
  text = text.replace(
    /trpc\.admin\.(clear|setDefault)\.mutate\(\{ id: ([^)]+)\)/g,
    'trpc.admin.$1.mutate({ id: $2 })',
  );

  // logs query: add id field if first arg is sandboxId only
  text = text.replace(
    /trpc\.sandboxes\.logs\.query\(\s*([^,\s]+),\s*(\{[^}]*\})\s*\)/g,
    'trpc.sandboxes.logs.query({ id: $1, ...$2 })',
  );
  text = text.replace(
    /trpc\.callLogs\.get\.query\(\s*([^)]+)\)/g,
    'trpc.callLogs.get.query({ id: $1 })',
  );

  fs.writeFileSync(file, text);
}