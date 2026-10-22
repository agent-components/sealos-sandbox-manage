-- 业务表放在 sandbox schema。登录复用 public.users，不在这里建用户表。

CREATE SCHEMA IF NOT EXISTS sandbox;

CREATE TABLE IF NOT EXISTS sandbox.api_keys (
  id text PRIMARY KEY,
  name text NOT NULL,
  username text NOT NULL,
  key text NOT NULL UNIQUE,
  sandbox_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS api_keys_username_idx ON sandbox.api_keys (username);

CREATE TABLE IF NOT EXISTS sandbox.templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  image text NOT NULL,
  image_registry jsonb,
  launch_command jsonb,
  cpu double precision NOT NULL,
  memory_gi double precision NOT NULL,
  replicas integer NOT NULL DEFAULT 1,
  auto_shutdown boolean NOT NULL DEFAULT false,
  idle_minutes integer NOT NULL DEFAULT 5,
  ports jsonb NOT NULL DEFAULT '[]',
  env jsonb NOT NULL DEFAULT '[]',
  storage jsonb NOT NULL DEFAULT '[]',
  config_map jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sandbox.records (
  sandbox_id text PRIMARY KEY,
  owner text NOT NULL,
  template_id text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'starting',
  auto_shutdown boolean NOT NULL DEFAULT false,
  idle_minutes integer NOT NULL DEFAULT 5,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  inflight integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sandbox.records
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE sandbox.records
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'starting';
ALTER TABLE sandbox.records
  ADD COLUMN IF NOT EXISTS auto_shutdown boolean NOT NULL DEFAULT false;
ALTER TABLE sandbox.records
  ADD COLUMN IF NOT EXISTS idle_minutes integer NOT NULL DEFAULT 5;
ALTER TABLE sandbox.records
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sandbox.records
  ADD COLUMN IF NOT EXISTS inflight integer NOT NULL DEFAULT 0;
ALTER TABLE sandbox.records
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE sandbox.records DROP COLUMN IF EXISTS last_idle_shutdown_at;

CREATE INDEX IF NOT EXISTS records_owner_idx ON sandbox.records (owner);
DROP INDEX IF EXISTS sandbox.records_idle_shutdown_idx;
CREATE INDEX IF NOT EXISTS records_idle_shutdown_idx
  ON sandbox.records (last_activity_at)
  WHERE auto_shutdown = true AND state = 'running';

DO $$
BEGIN
  IF to_regclass('sandbox.tags') IS NOT NULL THEN
    UPDATE sandbox.records AS record
    SET tags = legacy.tags
    FROM sandbox.tags AS legacy
    WHERE record.sandbox_id = legacy.sandbox_id
      AND record.owner = legacy.owner;
    DROP TABLE sandbox.tags;
  END IF;
END $$;

-- 旧版独立 idle 表并入 records 后删除
DO $$
BEGIN
  IF to_regclass('sandbox.idle') IS NOT NULL THEN
    UPDATE sandbox.records AS record
    SET auto_shutdown = idle.auto_shutdown,
        idle_minutes = idle.idle_minutes,
        last_activity_at = idle.last_activity_at,
        inflight = idle.inflight,
        updated_at = idle.updated_at
    FROM sandbox.idle AS idle
    WHERE record.sandbox_id = idle.sandbox_id
      AND record.owner = idle.owner;
    DROP TABLE sandbox.idle;
  END IF;
END $$;

DROP INDEX IF EXISTS sandbox.idle_shutdown_idx;
DROP INDEX IF EXISTS sandbox.records_tags_key_idx;
ALTER TABLE sandbox.records DROP COLUMN IF EXISTS tags_key;
CREATE INDEX IF NOT EXISTS records_tags_idx ON sandbox.records USING gin (tags);

CREATE TABLE IF NOT EXISTS sandbox.mcp_logs (
  id text PRIMARY KEY,
  username text,
  api_key_id text,
  api_key_name text,
  channel text NOT NULL DEFAULT 'mcp',
  tool text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  arguments jsonb NOT NULL,
  status integer NOT NULL,
  ok boolean NOT NULL,
  result_key text,
  result_error text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  duration_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_logs_started_idx ON sandbox.mcp_logs (started_at DESC);
CREATE INDEX IF NOT EXISTS mcp_logs_tool_started_idx ON sandbox.mcp_logs (tool, started_at DESC);
CREATE INDEX IF NOT EXISTS mcp_logs_username_started_idx ON sandbox.mcp_logs (username, started_at DESC);
CREATE INDEX IF NOT EXISTS mcp_logs_api_key_started_idx ON sandbox.mcp_logs (api_key_id, started_at DESC);
