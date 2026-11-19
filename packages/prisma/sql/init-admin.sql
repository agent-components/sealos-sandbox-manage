-- 初始化管理员账号（可重复执行）
-- 账号: admin
-- 密码: admin123
-- 密码格式: scrypt$<salt>$<hash>（与 apps/server 登录校验一致）

INSERT INTO sandbox.users (
  id,
  account,
  password,
  display_name,
  role,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  'admin',
  'scrypt$02f9d42c69c5ded3b451f5a52d929dd5$0a4b11e19593db9f20eb33f71cda086ec84f386669b7d5d938cced983f47f11369c18465e483b1755f1e4893c5c05064bcb06f3f65a2c35e6dfea93b2d3e7864',
  '管理员',
  'ADMIN'::sandbox."UserRole",
  'ACTIVE'::sandbox."UserStatus",
  now(),
  now()
)
ON CONFLICT (account) DO NOTHING;
