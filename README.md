# SealOS 沙箱管理

为 Agent 和开发者准备的云端沙箱控制台。每台沙箱是一个 [Sealos](https://sealos.io) 应用：本项目负责登录、模板、生命周期、公网地址，以及在容器里执行命令、读取文件。

控制台、REST 和 MCP 使用同一套沙箱能力。机器规格由 Sealos App Launchpad 提供，kubeconfig 只放在服务端。

## 功能

- 按模板创建沙箱，查看状态、公网地址、启停和删除
- 调整 CPU、内存、磁盘，给沙箱打标签
- 空闲超时后自动关机；进行中的请求会计入活动时间
- 在容器内执行命令，读取文件，查看 Pod 日志
- 登录会话与 API Key。Key 按沙箱授权，数据按用户隔离
- MCP Streamable HTTP，工具与 OpenAPI 的沙箱接口一一对应
- 记录 `runSandboxCommand` 的调用；结果可存到对象存储

## 架构

```text
控制台 / curl / MCP 客户端
            │
            ▼
      SealOS 沙箱管理
       │    │    │
       │    │    └── Kubernetes API（Pod exec、日志、读文件）
       │    └─────── Sealos App Launchpad（应用的增删改查、启停、公网域名）
       └──────────── MongoDB（用户、模板、令牌、标签、空闲状态、调用日志）
                     对象存储（可选，命令结果 JSON）
```

Launchpad 请求使用 `Authorization: encodeURIComponent(kubeconfig)`。应用本身的增删改查、暂停和启动走 Launchpad；进容器执行命令、拉日志、读文件走集群 API。

## 环境要求

- Node.js 20 或更高版本
- MongoDB
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

打开 [http://localhost:3000/login](http://localhost:3000/login)。`db:init` 只初始化用户：不存在时写入 `admin` / `changeme`，已存在则跳过。登录后请立刻更换密码。模板、令牌和其他集合在首次使用时创建，启动后到「模板管理」里新建模板，再创建沙箱。

生产构建：

```bash
npm run build
npm run start
```

## 配置

复制 `.env.example` 为 `.env.local`。带 `*` 的是启动和初始化数据库所必需的。

| 变量 | 说明 |
| --- | --- |
| `MONGODB_URI` * | MongoDB 连接串。路径就是数据库名，例如 `mongodb://user:pass@host:27017/boat?authSource=admin` |
| `BOAT_SESSION_SECRET` * | 登录 Cookie 的加密密钥，建议不少于 32 个随机字符。会话有效期 7 天 |
| `SEALOS_LAUNCHPAD_BASE` * | App Launchpad 根地址，不要末尾斜杠 |
| `SEALOS_KUBECONFIG_PATH` * | kubeconfig 文件路径，仅服务端读取。`.sealos/` 已被 git 忽略 |
| `MINIO_ENDPOINT` | 对象存储地址，例如 `https://objectstorageapi.example.com` |
| `MINIO_ACCESS_KEY` | 对象存储访问密钥 |
| `MINIO_SECRET_KEY` | 对象存储私钥 |
| `MINIO_BUCKET` | 存放命令结果的桶名 |
| `MINIO_REGION` | 可选，默认 `us-east-1` |

四项 MinIO 配置要同时填写才会上传结果。缺任意一项时跳过上传，调用记录里会留下失败原因。

## 控制台

登录后有四个页面：

| 路径 | 作用 |
| --- | --- |
| `/sandboxes` | 沙箱列表、创建、详情、日志、启停和删除 |
| `/templates` | 镜像、端口、环境变量、存储、启动命令和默认规格 |
| `/mcp-logs` | `runSandboxCommand` 的调用记录 |
| `/apikeys` | 令牌名称、授权沙箱，以及复制明文和 MCP 配置 |

## 认证与权限

两种身份，沙箱数据按用户名隔离：

- **登录会话**：Cookie 名 `boat_user_session`。可以操作该用户的全部沙箱。
- **API Key**：`Authorization: Bearer boat_...`。只能访问这把 Key 授权列表里的沙箱；用它创建的沙箱会自动加入列表。每个用户最多 20 把 Key，每把最多授权 200 个沙箱。删除沙箱时会从该用户所有 Key 里移除。

令牌、令牌明文和调用日志只接受登录会话，不接受 API Key 调用自身。模板接口两种身份都可以访问，模板在整个实例内共享，不按用户拆分。

列表里的 Key 会打码（保留前缀 `boat_` 和一小段字符）。明文只在创建响应，以及 `GET /api/v1/apikeys/{id}/secret` 中返回。数据库里保存的是完整明文。

## MCP

端点为 `POST /api/mcp`，协议是无状态的 MCP Streamable HTTP，不建立会话。支持的协议版本：`2025-06-18`、`2025-03-26`、`2024-11-05`。

`initialize`、`tools/list` 和 `ping` 不需要登录。`tools/call` 与 REST 使用同一套认证：`Authorization: Bearer boat_...`，或登录 Cookie。

工具名就是 OpenAPI 的 `operationId`：

`listSandboxes`、`getSandbox`、`createSandbox`、`stopSandbox`、`resumeSandbox`、`runSandboxCommand`、`getSandboxArtifact`、`deleteSandbox`

路径参数、查询参数和 JSON 请求体都摊平在工具参数里。

`runSandboxCommand` 在 MCP 中不限制执行时间。客户端 `Accept` 含 `text/event-stream` 时，输出在同一次 POST 的 SSE 里推送（`notifications/message`；带了 `progressToken` 时还有 `notifications/progress`），结束后再返回 `ok`、`exitCode`、`stdout`、`stderr`。客户端断开会取消命令。单路输出上限仍是 1MB。

```json
{
  "mcpServers": {
    "boat": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer boat_..."
      }
    }
  }
}
```

## 模板、规格与空闲关机

模板决定镜像、端口、环境变量、存储、配置文件挂载、启动命令、副本数，以及默认的 CPU、内存和空闲策略。创建沙箱时可以覆盖规格、追加环境变量，并单独指定标签和空闲关机。

CPU 档位：`0.5 / 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8` 核。

内存档位：`512Mi / 1G / 2G / 4G / 6G / 8G / 12G / 16G / 32G`（接口里用 Gi 数值，`0.5` 表示 512Mi）。

磁盘：整数 Gi，范围 1–1000，默认 3。

空闲关机默认关闭。打开后，等待时间至少 5 分钟、最长 7 天（10080 分钟）。REST 与 MCP 对沙箱的访问都会计入活动；有请求进行时不会关机。进程内每分钟扫描一次，只暂停仍在运行的实例。

## 开发

```bash
npm run dev       # 开发服务器
npm run lint      # ESLint
npm run build     # 生产构建
npm run db:init   # 初始化管理员用户
```

```text
src/app/(app)/     控制台页面
src/app/api/       REST、登录和 MCP
src/components/    控制台组件
src/lib/auth/      会话与用户
src/lib/apikey/    令牌
src/lib/sandbox/   沙箱模型、命令、文件、空闲关机
src/lib/template/  模板
src/lib/mcp/       MCP 协议与调用日志
src/lib/sealos/    Launchpad 与 Kubernetes
src/lib/openapi/   OpenAPI 文档
scripts/init-db.mjs
```

## 安全

对外发布前请处理下面几项：

- 默认账号是 `admin` / `changeme`，密码以明文存在 `users` 集合
- API Key 以明文存在 `apikeys` 集合。列表接口打码，但知道会话的人可以再次取回明文
- kubeconfig 等同于集群凭证，不要提交到仓库。使用 `.sealos/` 或环境变量指向的路径
- 模板在实例内共享，任一登录用户都可以修改或删除
- 更换 `BOAT_SESSION_SECRET` 会使已有登录失效

本仓库尚未包含 `LICENSE`。公开仓库前请自行补充许可证文件。
