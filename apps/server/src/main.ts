import './infrastructure/env';
import { createServer } from './server';
import { startIdleSweeper } from './lib/sandbox/idle-sweeper';
import { startLogRetention } from './lib/logs/retention';

const port = Number(process.env.PORT ?? 3000);
const server = createServer();

server.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
  console.log(`tRPC endpoint: http://localhost:${port}/trpc`);
  console.log(`OpenAPI document: http://localhost:${port}/api/openapi.json`);
  startIdleSweeper();
  startLogRetention();
});