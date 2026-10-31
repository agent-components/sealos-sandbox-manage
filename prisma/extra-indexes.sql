-- Prisma schema 无法表达的部分索引，由 npm run db:indexes / db:init 补齐。

CREATE INDEX IF NOT EXISTS records_idle_shutdown_idx
  ON sandbox.records (last_activity_at)
  WHERE auto_shutdown = true AND state = 'running';

CREATE UNIQUE INDEX IF NOT EXISTS usage_segments_open_uidx
  ON sandbox.usage_segments (sandbox_id)
  WHERE ended_at IS NULL;

-- 至多一个默认 Sealos 区域
CREATE UNIQUE INDEX IF NOT EXISTS sealos_regions_default_uidx
  ON sandbox.sealos_regions (is_default)
  WHERE is_default = true;
