# SealOS 沙箱管理

为 Agent 和开发者准备的云端沙箱控制台。每台沙箱是一个 [Sealos](https://sealos.io) 应用：本项目负责登录、模板、生命周期、公网地址，以及在容器里执行命令、读取文件。

控制台、REST 和 MCP 使用同一套沙箱能力。机器规格由 Sealos App Launchpad 提供，kubeconfig 只放在服务端。

## 功能

- 按模板创建沙箱，查看状态、公网地址、启停和删除
- 调整 CPU、内存、磁盘，给沙箱打标签
- 空闲超时后自动关机；进行中的请求会计入活动时间
- 在容器内执行命令，读取文件，查看 Pod 日志
- 登录会话与 API Key。Key 按沙箱授权，数据按用户隔离
- MCP Streamable HTTP，提供对标 Cursor Agent 的文件工具（与 OpenAPI 独立）
- 记录全部 MCP 工具调用；结果可存到对象存储
- 按 Sealos 广州可用区口径记录 CPU、内存、存储卷与公网端口用量，控制台展示账单（不扣余额、不拦截）

## 架构

```text
控制台 / curl / MCP 客户端
            │
            ▼
      SealOS 沙箱管理
       │    │    │
       │    │    └── Kubernetes API（Pod exec、日志、读文件）
       │    └─────── Sealos App Launchpad（应用的增删改查、启停、公网域名）
       └──────────── PostgreSQL + Prisma（public.users 登录；schema sandbox 存放模板、令牌、标签、空闲状态、调用日志）
                     对象存储（可选，命令结果 JSON）
```

Launchpad 请求使用 `Authorization: encodeURIComponent(kubeconfig)`。应用本身的增删改查、暂停和启动走 Launchpad；进容器执行命令、拉日志、读文件走集群 API。

## 环境要求

- Node.js 20 或更高版本
- PostgreSQL，库 `bl_harness`。登录复用已有的 `public.users`
- 可访问的 Sealos App Launchpad，以及对应集群的 kubeconfig
- 对象存储（MinIO 兼容，可选）。不配置时调用日志仍会写入，只是没有结果正文

## 快速开始

```bash
cp .env.example .env.local
# 填写下面「配置」一节里的必填项，并把 kubeconfig 放到 SEALOS_KUBECONFIG_PATH
npm install
npm run db:init
npm run dev
```

打开 [http://localhost:3000/login](http://localhost:3000/login)。`db:init` 用 Prisma `db push` 同步 schema `sandbox` 业务表，并补齐部分索引，不改动 `public.users`。登录名是这张表的 `account`。启动后到「模板管理」里新建模板，再创建沙箱。

生产构建：

```bash
npm run build
npm run start
```

## 配置

复制 `.env.example` 为 `.env.local`。带 `*` 的是启动和初始化数据库所必需的。

| 变量                        | 说明                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` \*           | PostgreSQL 连接串，路径是数据库名，例如 `postgresql://postgres:密码@host:5432/bl_harness`。登录读 `public.users`，其他表在 schema `sandbox` |
| `SEALOS_LAUNCHPAD_BASE` \*  | App Launchpad 根地址，不要末尾斜杠                                                                                                          |
| `SEALOS_KUBECONFIG_PATH` \* | kubeconfig 文件路径，仅服务端读取。`.sealos/` 已被 git 忽略                                                                                 |
| `MINIO_ENDPOINT`            | 对象存储地址，例如 `https://objectstorageapi.example.com`                                                                                   |
| `MINIO_ACCESS_KEY`          | 对象存储访问密钥                                                                                                                            |
| `MINIO_SECRET_KEY`          | 对象存储私钥                                                                                                                                |
| `MINIO_BUCKET`              | 存放命令结果的桶名                                                                                                                          |
| `MINIO_REGION`              | 可选，默认 `us-east-1`                                                                                                                      |
| `BILLING_PRICE_CPU`         | 可选。CPU 单价（元/核·小时），默认广州 G `0.01742`                                                                                          |
| `BILLING_PRICE_MEMORY`      | 可选。内存单价（元/GB·小时），默认 `0.008786`                                                                                               |
| `BILLING_PRICE_STORAGE`     | 可选。存储卷单价（元/GB·小时），默认 `0.000532`                                                                                             |
| `BILLING_PRICE_PORT`        | 可选。公网端口单价（元/个·小时），默认 `0.007`                                                                                              |

四项 MinIO 配置要同时填写才会上传结果。缺任意一项时跳过上传，调用记录里会留下失败原因。

## 控制台

登录后有四个页面：

| 路径         | 作用                                           |
| ------------ | ---------------------------------------------- |
| `/sandboxes` | 沙箱列表、创建、详情、日志、启停和删除；「IDE」打开 Cursor Remote-SSH（`sandbox@公网host:port`，需 22/TCP） |
| `/templates` | 镜像、端口、环境变量、存储、启动命令和默认规格 |
| `/mcp-logs`  | `exec` 的调用记录                              |
| `/billing`   | 用量账单：按区间汇总 CPU、内存、存储与公网端口费用 |
| `/apikeys`   | 令牌名称、授权沙箱、MCP 工具白名单，以及复制明文和 MCP 配置 |

## 认证与权限

两种身份，沙箱数据按用户名隔离：

- **登录 token**：密码校验通过后，把 64 位十六进制 token 写入 `public.users.token`，过期时间写入 `tokenExpiredAt`（30 天），并在登录响应里返回。控制台把它放在本地，之后每个请求带 `Authorization: Bearer <token>`。不使用 Cookie。同一账号只保留一枚。未过期时重新登录会复用原来的 token，过期后才签发新的。可以操作该用户的全部沙箱。
- **API Key**：`Authorization: Bearer sandbox_...`。只能访问这把 Key 授权列表里的沙箱；用它创建的沙箱会自动加入列表。可选 `allowedTools` 限制 MCP 工具（不填 / 空 = 全部可用；非空则 `tools/list` 只返回勾选工具，`tools/call` 拒绝其余）。每个用户最多 20 把 Key，每把最多授权 200 个沙箱。删除沙箱时会从该用户所有 Key 里移除。

令牌、令牌明文和调用日志只接受登录 token，不接受 API Key 调用自身。模板接口两种身份都可以访问，模板在整个实例内共享，不按用户拆分。

列表里的 Key 会打码（保留前缀和一小段字符）。明文只在创建响应，以及 `GET /api/v1/apikeys/{id}/secret` 中返回。数据库里保存的是完整明文。新密钥前缀是 `sandbox_`。

## MCP

端点为 `POST /api/mcp`，协议是无状态的 MCP Streamable HTTP，不建立会话。支持的协议版本：`2025-06-18`、`2025-03-26`、`2024-11-05`。

`initialize`、`tools/list` 和 `ping` 不需要登录；若请求带了 API Key，则按该 Key 的 `allowedTools` 过滤工具列表与 `initialize` 说明。`tools/call` 与 REST 使用同一套认证：`Authorization: Bearer` 登录 token 或 `sandbox_...`；API Key 还会校验工具是否在白名单内。

MCP 工具与 OpenAPI **相互独立**，对标 Cursor Agent 本地文件操作。沙箱由请求头 `x-sandbox-id` 指定，路径为沙箱内绝对路径：

| 工具     | 对标       | 作用                                                      |
| -------- | ---------- | --------------------------------------------------------- |
| `read`   | Read       | 读文件；文本支持 `offset`/`limit`；图片/二进制走 artifact |
| `write`  | Write      | 创建/覆盖文件                                             |
| `edit`   | StrReplace | 精确字符串替换                                            |
| `delete` | Delete     | 删除普通文件                                              |
| `grep`   | Grep       | 内容搜索                                                  |
| `glob`   | Glob       | 按模式找路径                                              |
| `exec`   | Shell      | 执行命令（可 SSE、不限时）                                |

沙箱的创建、列表、启停、删除等请走 REST。

`exec` 在 MCP 中不限制执行时间。客户端 `Accept` 含 `text/event-stream` 时，输出在同一次 POST 的 SSE 里推送（`notifications/message`；带了 `progressToken` 时还有 `notifications/progress`），结束后再返回 `ok`、`exitCode`、`stdout`、`stderr`。客户端断开会取消命令。单路输出上限仍是 1MB。

```json
{
  "mcpServers": {
    "sandbox": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer sandbox_...",
        "x-sandbox-id": "<sandbox-id>"
      }
    }
  }
}
```

## 模板、规格与空闲关机

模板决定镜像、端口、环境变量、存储、配置文件挂载、启动命令、副本数，以及默认的 CPU、内存和空闲策略。创建沙箱时可以覆盖规格、追加环境变量，并单独指定标签和空闲关机。

CPU 档位：`0.1 / 0.2 / 0.5 / 1 / 2 / 3 / 4 / 8` 核。

内存档位：`128M / 256M / 512M / 1G / 2G / 4G / 8G / 16G`（接口里用 Gi 数值，`0.125` 表示 128M，`0.5` 表示 512M）。

磁盘：整数 Gi，范围 1–1000，默认 3。

空闲关机默认关闭。打开后，等待时间至少 5 分钟、最长 7 天（10080 分钟）。REST 与 MCP 对沙箱的访问都会计入活动；有请求进行时不会关机。进程内每分钟扫描一次，只暂停仍在运行的实例。

## 用量账单

按 Sealos 广州（gzg）公开单价估算本机群成本，只记账与展示，不扣余额、不因费用停机。

- **CPU、内存、公网端口**：仅 `running` 计费；CPU、内存按核数/GB × 副本数。
- **存储卷**：沙箱仍存在（含暂停）时按磁盘 Gi 持续计费；从 Launchpad 确认删除后停止。
- **不含**：外网流量；功能上线前的历史用量。
- 创建、改配、启停、删除与每分钟状态扫描会切分用量段；段开启时写入当时单价。
- `GET /api/v1/billing?from=&to=` 仅登录会话可用，默认本月；控制台路径 `/billing`。

## 开发

```bash
npm run dev         # 开发服务器
npm run lint        # ESLint
npm run build       # 生产构建（含 prisma generate）
npm run db:init     # Prisma 同步 sandbox 表与额外索引
npm run db:generate # 仅生成 Prisma Client
npm run db:push     # 仅 prisma db push
```

```text
prisma/            Prisma schema 与额外索引 SQL
src/app/(app)/     控制台页面
src/app/api/       REST、登录和 MCP
src/components/    控制台组件
src/lib/auth/      会话与用户
src/lib/apikey/    令牌
src/lib/db/        Prisma 客户端
src/lib/sandbox/   沙箱模型、命令、文件、空闲关机
src/lib/billing/   用量段与账单汇总
src/lib/template/  模板
src/lib/mcp/       MCP 协议与调用日志
src/lib/sealos/    Launchpad 与 Kubernetes
src/lib/openapi/   OpenAPI 文档
scripts/init-db.mjs
```

## 安全

对外发布前请处理下面几项：

- 登录账号来自 `public.users`，密码沿用这张表里的存法
- API Key 以明文存在 `sandbox.api_keys`。列表接口打码，但知道会话的人可以再次取回明文
- kubeconfig 等同于集群凭证，不要提交到仓库。使用 `.sealos/` 或环境变量指向的路径
- 模板在实例内共享，任一登录用户都可以修改或删除
- 退出登录会清空该账号在 `public.users` 上的 token

本仓库尚未包含 `LICENSE`。公开仓库前请自行补充许可证文件。
