import { openApiDocument } from "@/lib/openapi/document";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

type JsonObject = Record<string, unknown>;

type ParameterObject = {
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: JsonObject;
};

type OperationObject = {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: ParameterObject[];
  requestBody?: {
    required?: boolean;
    content?: {
      "application/json"?: { schema?: JsonObject };
    };
  };
  responses?: Record<
    string,
    {
      content?: {
        "application/json"?: { schema?: JsonObject };
      };
    }
  >;
};

export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonObject;
  outputSchema?: JsonObject;
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
};

/** OpenAPI 操作与 MCP 工具定义的对应关系，供 tools/list 使用。 */
export type McpRoute = {
  definition: McpToolDefinition;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  pathParams: string[];
  queryParams: string[];
  /** 为 null 表示该操作没有 JSON 请求体。 */
  bodyProperties: string[] | null;
};

function cloneSchema(schema: unknown): JsonObject | undefined {
  if (!schema || typeof schema !== "object" || Array.isArray(schema))
    return undefined;
  return JSON.parse(JSON.stringify(schema)) as JsonObject;
}

function successSchema(operation: OperationObject): JsonObject | undefined {
  const codes = Object.keys(operation.responses ?? {})
    .filter((code) => code.startsWith("2"))
    .sort();
  for (const code of codes) {
    const schema = cloneSchema(
      operation.responses?.[code]?.content?.["application/json"]?.schema
    );
    if (schema) return schema;
  }
  return undefined;
}

function annotations(method: string, operationId: string, title: string) {
  const readOnly = method === "GET";
  const command = operationId === "runSandboxCommand";
  return {
    title,
    readOnlyHint: readOnly,
    destructiveHint: command,
    idempotentHint: readOnly,
    openWorldHint: true,
  };
}

function buildRoute(
  path: string,
  method: string,
  operation: OperationObject
): McpRoute {
  const operationId = operation.operationId;
  if (!operationId) {
    throw new Error(`OpenAPI ${method.toUpperCase()} ${path} 缺少 operationId`);
  }

  const properties: JsonObject = {};
  const required: string[] = [];
  const pathParams: string[] = [];
  const queryParams: string[] = [];
  const seen = new Set<string>();

  for (const parameter of operation.parameters ?? []) {
    if (
      !parameter.name ||
      (parameter.in !== "path" && parameter.in !== "query")
    )
      continue;
    if (seen.has(parameter.name)) {
      throw new Error(`OpenAPI 参数重名：${operationId}.${parameter.name}`);
    }
    seen.add(parameter.name);
    const schema = cloneSchema(parameter.schema) ?? {};
    if (parameter.description && typeof schema.description !== "string") {
      schema.description = parameter.description;
    }
    properties[parameter.name] = schema;
    if (parameter.in === "path") {
      pathParams.push(parameter.name);
      required.push(parameter.name);
    } else {
      queryParams.push(parameter.name);
      if (parameter.required) required.push(parameter.name);
    }
  }

  const bodySchema = cloneSchema(
    operation.requestBody?.content?.["application/json"]?.schema
  );
  let bodyProperties: string[] | null = null;
  if (bodySchema) {
    bodyProperties = [];
    const bodyFields = bodySchema.properties;
    if (
      bodyFields &&
      typeof bodyFields === "object" &&
      !Array.isArray(bodyFields)
    ) {
      for (const [name, schema] of Object.entries(bodyFields as JsonObject)) {
        if (seen.has(name)) {
          throw new Error(`OpenAPI 参数重名：${operationId}.${name}`);
        }
        seen.add(name);
        properties[name] = schema;
        bodyProperties.push(name);
      }
    }
    if (
      operation.requestBody?.required !== false &&
      Array.isArray(bodySchema.required)
    ) {
      for (const name of bodySchema.required) {
        if (typeof name === "string") required.push(name);
      }
    }
  }

  const title = operation.summary || operationId;
  const description = [
    operation.summary,
    operation.description,
    `对应 REST ${method.toUpperCase()} /api/v1${path}。`,
    operationId === "runSandboxCommand"
      ? "通过 MCP 调用时，stdout/stderr 会随到随以 SSE 推送，执行时间不限制，客户端断开即取消命令。上文的 60 秒超时只约束 REST。单路输出仍不得超过 1MB。"
      : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  const inputSchema: JsonObject = {
    type: "object",
    properties,
    additionalProperties: false,
  };
  if (required.length > 0) inputSchema.required = required;

  const outputSchema = successSchema(operation);
  return {
    definition: {
      name: operationId,
      title,
      description,
      inputSchema,
      ...(outputSchema ? { outputSchema } : {}),
      annotations: annotations(method.toUpperCase(), operationId, title),
    },
    method: method.toUpperCase() as McpRoute["method"],
    path,
    pathParams,
    queryParams,
    bodyProperties,
  };
}

/** 对外暴露的 MCP 工具；REST / OpenAPI 仍保留完整接口。 */
export const MCP_TOOL_NAMES = [
  "runSandboxCommand",
  "getSandboxArtifact",
] as const;

/** 从当前 OpenAPI 文档生成 MCP 工具，仅包含 {@link MCP_TOOL_NAMES}。 */
function mcpRoutesFromOpenApi(): McpRoute[] {
  const document = openApiDocument() as unknown as {
    paths: Record<
      string,
      Partial<Record<(typeof HTTP_METHODS)[number], OperationObject>>
    >;
  };
  const allow = new Set<string>(MCP_TOOL_NAMES);
  const routes: McpRoute[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = item?.[method];
      if (!operation?.operationId || !allow.has(operation.operationId))
        continue;
      routes.push(buildRoute(path, method, operation));
    }
  }
  const missing = MCP_TOOL_NAMES.filter(
    (name) => !routes.some((route) => route.definition.name === name)
  );
  if (missing.length > 0) {
    throw new Error(`OpenAPI 缺少 MCP 工具：${missing.join(", ")}`);
  }
  return routes;
}

let cached: McpRoute[] | undefined;

export function mcpRoutes(): McpRoute[] {
  if (!cached) cached = mcpRoutesFromOpenApi();
  return cached;
}
