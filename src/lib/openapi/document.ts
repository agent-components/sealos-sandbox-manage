import { CPU_OPTIONS, MEMORY_OPTIONS } from "@/lib/sealos/resources";

const cpuSchema = {
  type: "number",
  enum: [...CPU_OPTIONS],
  description: "CPU 核数档位",
} as const;

const memorySchema = {
  type: "number",
  enum: MEMORY_OPTIONS.map((item) => item.gi),
  description: "内存 Gi。0.5 表示 512Mi",
} as const;

const sandboxSchema = {
  type: "object",
  required: ["id", "state", "cpu", "memoryGi", "diskGi", "publicUrl", "tags"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    state: {
      type: "string",
      enum: ["starting", "running", "stopped", "error"],
      description: "沙箱状态",
    },
    cpu: { type: "number" },
    memoryGi: { type: "number" },
    diskGi: { type: "number" },
    publicUrl: { type: ["string", "null"] },
    image: { type: "string" },
    templateId: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    createdAt: { type: "string" },
    upTime: { type: "string" },
  },
} as const;

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
    details: {},
  },
} as const;

const sandboxResponse = {
  type: "object",
  required: ["sandbox"],
  properties: { sandbox: sandboxSchema },
} as const;

const sandboxId = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "沙箱 ID",
} as const;

const userAuth = [{ bearerAuth: [] }, { sessionCookie: [] }];

const createSandboxBody = {
  type: "object",
  required: ["templateId"],
  properties: {
    templateId: { type: "string", minLength: 1, description: "模板 ID" },
    name: {
      type: "string",
      minLength: 1,
      maxLength: 48,
      pattern: "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$",
      description: "省略时由服务端生成。小写字母、数字和连字符，首尾为字母或数字",
    },
    cpu: cpuSchema,
    memoryGi: memorySchema,
    diskGi: { type: "integer", minimum: 1, maximum: 1000, description: "磁盘 Gi" },
    env: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 128 },
          value: { type: "string", maxLength: 4096, default: "" },
        },
      },
    },
    tags: {
      type: "array",
      maxItems: 20,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 32,
        pattern: "^[\\p{L}\\p{N}][\\p{L}\\p{N}._-]{0,31}$",
      },
    },
  },
} as const;

function errors(...codes: Array<400 | 401 | 403 | 404 | 409 | 413 | 500 | 504>) {
  const text: Record<number, string> = {
    400: "参数校验失败",
    401: "未登录或 API Key 无效",
    403: "无权访问该沙箱，或 API Key 未授权",
    404: "沙箱不存在",
    409: "沙箱未在运行",
    413: "命令输出超过 1MB",
    500: "服务器错误",
    504: "命令执行超时",
  };
  return Object.fromEntries(
    codes.map((code) => [
      String(code),
      {
        description: text[code],
        content: { "application/json": { schema: errorSchema } },
      },
    ]),
  );
}

/**
 * Agent 可调用的沙箱接口。
 * `servers.url` 为 `/api/v1`。
 */
export function openApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Boat",
      version: "0.1.0",
      description:
        "查看、创建、删除沙箱，关机、开机，以及在运行中的沙箱内执行命令。认证为登录会话，或 `Authorization: Bearer boat_...`。会话可操作该用户的全部沙箱。API Key 只能访问其授权列表中的沙箱；用该 Key 创建的沙箱会自动加入授权列表。删除后会从各 Key 的授权列表中移除。",
    },
    servers: [{ url: "/api/v1" }],
    paths: {
      "/sandboxes": {
        get: {
          operationId: "listSandboxes",
          summary: "查看沙箱列表",
          security: userAuth,
          parameters: [
            {
              name: "tag",
              in: "query",
              description: "精确标签，可重复。需同时包含全部标签",
              schema: { type: "array", items: { type: "string" } },
              style: "form",
              explode: true,
            },
            {
              name: "q",
              in: "query",
              description: "标签关键词，空格或逗号分隔，每个词都要能在某个标签中找到",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "当前用户的沙箱列表",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["sandboxes"],
                    properties: {
                      sandboxes: { type: "array", items: sandboxSchema },
                    },
                  },
                },
              },
            },
            ...errors(400, 401, 500),
          },
        },
        post: {
          operationId: "createSandbox",
          summary: "创建沙箱",
          security: userAuth,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: createSandboxBody,
                example: { templateId: "dev", cpu: 0.5, memoryGi: 0.5, diskGi: 3 },
              },
            },
          },
          responses: {
            "201": {
              description: "已创建",
              content: { "application/json": { schema: sandboxResponse } },
            },
            ...errors(400, 401, 500),
          },
        },
      },
      "/sandboxes/{id}": {
        get: {
          operationId: "getSandbox",
          summary: "查看沙箱状态",
          security: userAuth,
          parameters: [sandboxId],
          responses: {
            "200": {
              description: "沙箱状态与详情。状态在 sandbox.state",
              content: { "application/json": { schema: sandboxResponse } },
            },
            ...errors(401, 403, 404, 500),
          },
        },
        delete: {
          operationId: "deleteSandbox",
          summary: "删除沙箱",
          security: userAuth,
          parameters: [sandboxId],
          responses: {
            "200": {
              description: "已删除，并从其所属用户的 API Key 授权列表中移除",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["ok"],
                    properties: { ok: { type: "boolean", const: true } },
                  },
                },
              },
            },
            ...errors(401, 403, 404, 500),
          },
        },
      },
      "/sandboxes/{id}/stop": {
        post: {
          operationId: "stopSandbox",
          summary: "关机",
          security: userAuth,
          parameters: [sandboxId],
          responses: {
            "200": {
              description: "关机后的沙箱",
              content: { "application/json": { schema: sandboxResponse } },
            },
            ...errors(401, 403, 404, 500),
          },
        },
      },
      "/sandboxes/{id}/commands": {
        post: {
          operationId: "runSandboxCommand",
          summary: "在沙箱内执行命令",
          description:
            "通过 Pod exec 在运行中的容器里执行 `/bin/sh -c`。命令结束后返回退出码与输出；非零退出码仍是 HTTP 200，`ok` 为 false。超时 60 秒。",
          security: userAuth,
          parameters: [sandboxId],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["command"],
                  properties: {
                    command: {
                      type: "string",
                      minLength: 1,
                      maxLength: 16384,
                      description: "交给 /bin/sh -c 的命令",
                    },
                  },
                },
                example: { command: "echo hello" },
              },
            },
          },
          responses: {
            "200": {
              description: "命令已执行。ok 表示退出码是否为 0",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["ok", "exitCode", "stdout", "stderr"],
                    properties: {
                      ok: { type: "boolean" },
                      exitCode: { type: "integer" },
                      stdout: { type: "string" },
                      stderr: { type: "string" },
                    },
                  },
                  example: {
                    ok: true,
                    exitCode: 0,
                    stdout: "1920 1080\n",
                    stderr: "",
                  },
                },
              },
            },
            ...errors(400, 401, 403, 404, 409, 413, 500, 504),
          },
        },
      },
      "/sandboxes/{id}/resume": {
        post: {
          operationId: "resumeSandbox",
          summary: "开机",
          security: userAuth,
          parameters: [sandboxId],
          responses: {
            "200": {
              description: "开机后的沙箱",
              content: { "application/json": { schema: sandboxResponse } },
            },
            ...errors(401, 403, 404, 500),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "控制台创建的 API Key，形如 boat_...",
        },
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "boat_user_session",
        },
      },
    },
  };
}
