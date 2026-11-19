# SealOS 沙箱管理

为 Agent 和开发者准备的云端沙箱控制台。技术栈对齐 [harness-admin](https://github.com/agent-components/harness-admin)：pnpm workspace、Vite + React、tRPC、Prisma 7。

```text
apps/web          Vite 控制台（开发端口 8080）
apps/server       tRPC + OpenAPI（开发端口 3000）
packages/prisma   Prisma schema 与 client（@sealos-sandbox-manage/prisma）
```

控制台走 tRPC。对外沙箱接口在 `/api/openapi`（文档：`/api/openapi.json`）。登录会话写在 `sandbox.users`。

作为 Harness 子应用时需配置 `HARNESS_ORIGIN`：iframe 带 `harness_sso` / `theme`，服务端向宿主兑票建会话；公开菜单 `GET /api/harness/menus`、工具 `GET /api/harness/tools`。独立运行可不配该项，仍用账号密码登录。

## 环境要求

- Node.js 22.17+（或 24.22+）
- pnpm 10
- PostgreSQL（库名按 `DATABASE_URL`）

## 快速开始

在仓库根目录用 `bash entrypoint.sh` 启动；或进入本目录：

```bash
cd sealos-sandbox-manage
cp apps/server/.env.example apps/server/.env
cp packages/prisma/.env.example packages/prisma/.env
# 两个文件填同一个 DATABASE_URL；服务端还可填 MinIO（调用日志结果）
# 嵌入 Harness 时再配 HARNESS_ORIGIN；独立运行可不配

pnpm install
pnpm db:init
pnpm dev:server   # http://localhost:3000
pnpm dev:web      # http://localhost:8080
```

生产：

```bash
cd sealos-sandbox-manage
pnpm build:dist
node dist/server/main.js
# 或在仓库根目录：bash entrypoint.sh production
```

## 控制台

| 菜单     | 作用                         |
| -------- | ---------------------------- |
| 沙箱列表 | 创建、启停、详情、日志、磁盘 |
| 模板管理 | 镜像与默认规格               |
| 调用日志 | OpenAPI 调用记录             |
| 用量账单 | 左下角用户菜单               |
| 集群设置 | 仅 ADMIN：区域凭证与单价     |
| 系统设置 | 仅 ADMIN：日志保留天数       |

## 对外 OpenAPI

前缀 `/api/openapi`，认证 `Authorization: Bearer <登录 token>`。

常见路径：`/sandboxes`、`/sandboxes/{id}`、`/sandboxes/{id}/stop`、`/resume`、`/commands`、`/billing` 等，见 `GET /api/openapi.json`。

OpenAPI 调用会写入 `sandbox.call_logs`；结果正文可选存到 MinIO。

## 数据库

```bash
pnpm db:generate
pnpm db:push
pnpm db:init      # generate + push
```

业务表在 schema `sandbox`。登录账号是 `sandbox.users`。
