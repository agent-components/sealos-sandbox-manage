import { spawn } from 'node:child_process';
import { access, cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');

function run(args, env = {}) {
  return new Promise((ok, fail) => {
    const child = spawn('pnpm', args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    child.on('error', fail);
    child.on('exit', (code) => {
      if (code === 0) ok();
      else fail(new Error(`pnpm ${args.join(' ')} 退出码 ${code}`));
    });
  });
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

console.log('构建 Prisma、服务端和前端');
await run(['--filter', '@boat/prisma', 'build']);
await run(['--filter', 'server', 'build']);
await run(['--filter', 'web', 'build'], { VITE_TRPC_URL: '/trpc' });

console.log('组装 dist');
const staging = await mkdtemp(resolve(tmpdir(), 'boat-'));
const skipNodeModules = (source) => !source.split(sep).includes('node_modules');

try {
  await cp(resolve(root, 'apps/server/dist'), resolve(staging, 'server'), {
    recursive: true,
    filter: skipNodeModules,
  });
  await cp(resolve(root, 'apps/web/dist'), resolve(staging, 'public'), {
    recursive: true,
    filter: skipNodeModules,
  });

  await rm(output, { recursive: true, force: true });
  await run(['--filter', 'server', 'deploy', '--prod', '--legacy', output]);

  await cp(resolve(staging, 'server'), resolve(output, 'server'), { recursive: true });
  await cp(resolve(staging, 'public'), resolve(output, 'public'), { recursive: true });
} finally {
  await rm(staging, { recursive: true, force: true });
}

const prismaPackage = await realpath(resolve(output, 'node_modules/@boat/prisma'));
if (!(await exists(resolve(prismaPackage, 'dist/client.js')))) {
  await cp(resolve(root, 'packages/prisma/dist'), resolve(prismaPackage, 'dist'), {
    recursive: true,
  });
}

await rm(resolve(output, 'src'), { recursive: true, force: true });
await rm(resolve(output, 'dist'), { recursive: true, force: true });
await rm(resolve(output, 'server/tsconfig.build.tsbuildinfo'), { force: true });
for (const name of [
  '.gitattributes',
  '.oxlintrc.json',
  '.prettierrc',
  'README.md',
  'tsconfig.json',
  'tsconfig.build.json',
  'tsconfig.build.tsbuildinfo',
]) {
  await rm(resolve(output, name), { force: true });
}

const envFile = resolve(root, 'apps/server/.env');
if (await exists(envFile)) {
  await cp(envFile, resolve(output, '.env'));
}

const packageJsonPath = resolve(output, 'package.json');
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
packageJson.scripts = { start: 'node server/main.js' };
await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

if (!(await exists(resolve(output, 'server/main.js')))) {
  throw new Error('dist/server/main.js 不存在');
}
if (!(await exists(resolve(output, 'public/index.html')))) {
  throw new Error('dist/public/index.html 不存在');
}

console.log('已生成 dist');
console.log('启动: node dist/server/main.js');
