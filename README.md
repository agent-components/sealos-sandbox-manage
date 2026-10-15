# boat — Sealos 沙箱

Boat 风格的沙箱控制台与 REST API。每台「虚拟机」对应一个 **Sealos 应用管理** 实例；本项目负责生命周期（增删改查、启停）与公网地址。容器内执行命令由镜像自身暴露的 API 提供，本项目不代理。

## 快速开始

```bash
cp .env.example .env.local
# 配置 MONGODB_URI、SEALOS_LAUNCHPAD_BASE、SEALOS_KUBECONFIG_PATH
npm install
npm run db:init   # 创建 boat 库、users 集合，并写入管理员
npm run dev
```

打开 [http://localhost:3000/login](http://localhost:3000/login)，使用 **平台用户**（MongoDB `boat.users`）登录。Sealos kubeconfig 仅在服务端配置，与登录账号无关。

### 环境变量

| 变量 | 说明 |
| --- | --- |
| `MONGODB_URI` | MongoDB 连接串 |
| `MONGODB_DB` | 数据库名，默认 `boat` |
| `BOAT_ADMIN_USERNAME` / `BOAT_ADMIN_PASSWORD` | 空库时创建的管理员账号 |
| `BOAT_SESSION_SECRET` | 登录会话加密密钥 |
| `SEALOS_LAUNCHPAD_BASE` | App Launchpad 根地址 |
| `SEALOS_DEFAULT_IMAGE` | 新建沙箱默认镜像 |
| `SEALOS_DEFAULT_PORT` | 公网 HTTP 端口（默认 80） |
| `SEALOS_KUBECONFIG_PATH` | kubeconfig 文件路径 |

## REST API

基路径 `/api/v1`。Agent 读取 `GET /api/openapi.json`（OpenAPI 3.1），当前可调用：

- `GET /api/v1/sandboxes` 查看沙箱列表
- `GET /api/v1/sandboxes/{id}` 查看沙箱状态
- `POST /api/v1/sandboxes` 创建沙箱
- `POST /api/v1/sandboxes/{id}/stop` 关机
- `POST /api/v1/sandboxes/{id}/resume` 开机
- `DELETE /api/v1/sandboxes/{id}` 删除沙箱

需先登录获取 session cookie，或使用控制台创建的 API Key（`Authorization: Bearer boat_...`）。沙箱与 API Key 按当前用户隔离。服务端另用环境中的 kubeconfig 调用 Sealos。

API Key 以明文保存在数据库中，列表接口会返回完整密钥。密钥管理接口（`/api/v1/apikeys`）仅接受登录会话，不接受 API Key 自身调用。每把 Key 有独立的沙箱授权列表，只能访问列表中的沙箱；用该 Key 创建的沙箱会自动加入列表。可在控制台编辑名称和授权沙箱。

### 示例

```bash
export BOAT_API_BASE=http://localhost:3000
# 登录（保存 cookie）
curl -sS -c /tmp/boat.ck -X POST "$BOAT_API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}'

# 创建
curl -sS -b /tmp/boat.ck -X POST "$BOAT_API_BASE/api/v1/sandboxes" \
  -H "Content-Type: application/json" \
  -d '{"type":"default"}'

# 列表
curl -sS -b /tmp/boat.ck "$BOAT_API_BASE/api/v1/sandboxes"

# 使用 API Key（在控制台「API Key」页创建）
curl -sS -H "Authorization: Bearer boat_..." \
  "$BOAT_API_BASE/api/v1/sandboxes"
```

拿到详情中的 `publicUrl` 后，直接对该地址调用容器 API（命令执行不在本项目范围）。

## 资源配置

创建 / 更新沙箱时通过滑块与数值配置：

- CPU：`0.5 / 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8` 核
- 内存：`512Mi / 1G / 2G / 4G / 6G / 8G / 12G / 16G / 32G`
- 磁盘：整数 Gi（默认 3）

```bash
curl -sS -b /tmp/boat.ck -X POST "$BOAT_API_BASE/api/v1/sandboxes" \
  -H "Content-Type: application/json" \
  -d '{"cpu":0.5,"memoryGi":0.5,"diskGi":3}'
```

## 与 Boat 对照

| Boat | 本项目 | 说明 |
| --- | --- | --- |
| 沙箱 CRUD | Sealos Launchpad API | 本项目代理 |
| stop / resume | pause / start | 本项目代理 |
| 公网地址 | Launchpad 公网域名 | 详情返回 |
| exec / 桌面 / fork / 快照 | — | 不做；exec 由容器 API |
| 自定义镜像 | — | 下一版 |

## 后端映射

所有应用操作走 Sealos Launchpad（`Authorization: encodeURIComponent(kubeconfig)`）：

- `POST/GET /api/v2alpha/apps`
- `GET/PATCH/DELETE /api/v2alpha/apps/:name`
- `GET /api/pauseApp?appName=`
- `GET /api/startApp?appName=`
