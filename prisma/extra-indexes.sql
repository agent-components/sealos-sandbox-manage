-- Prisma schema 无法表达的部分索引，在 db:init 时补齐。

CREATE INDEX IF NOT EXISTS records_idle_shutdown_idx
  ON sandbox.records (last_activity_at)
  WHERE auto_shutdown = true AND state = 'running';

CREATE UNIQUE INDEX IF NOT EXISTS usage_segments_open_uidx
  ON sandbox.usage_segments (sandbox_id)
  WHERE ended_at IS NULL;
