type JsonObject = Record<string, unknown>;

export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonObject;
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
};

const absolutePath = {
  type: "string",
  description: "沙箱内的绝对路径，必须以 / 开头",
} as const;

function tool(
  name: string,
  title: string,
  description: string,
  properties: JsonObject,
  required: string[],
  hints: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
  }
): McpToolDefinition {
  return {
    name,
    title,
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
    annotations: {
      title,
      ...hints,
      openWorldHint: true,
    },
  };
}

/** MCP Agent 文件工具；沙箱由请求头 x-sandbox-id 指定（客户端配置，非工具参数）。 */
export const MCP_TOOLS: McpToolDefinition[] = [
  tool(
    "read",
    "Read",
    [
      "读取沙箱内文件。",
      "文本：支持 offset（行，正数从 1 起，负数从尾部）与 limit，返回带行号内容。",
      "图片/二进制：整文件返回；offset/limit 不适用。",
      "不要用 exec 读文件。",
    ].join("\n"),
    {
      path: absolutePath,
      offset: {
        type: "integer",
        description:
          "起始行。正数从文件头 1-indexed；负数从文件尾倒数。仅文本有效。",
      },
      limit: {
        type: "integer",
        description: "读取行数。仅文本有效。",
      },
    },
    ["path"],
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  ),
  tool(
    "write",
    "Write",
    [
      "创建或覆盖沙箱内文件。",
      "已有文件优先用 edit 做精确替换，避免整文件重写。",
      "会自动创建父目录。内容上限 32MB。",
    ].join("\n"),
    {
      path: absolutePath,
      contents: { type: "string", description: "文件全文内容" },
    },
    ["path", "contents"],
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
  ),
  tool(
    "edit",
    "Edit",
    [
      "在文件中做精确字符串替换。",
      "默认 old_string 必须唯一匹配；replace_all 为 true 时替换全部。",
      "old_string 与 new_string 不能相同。",
    ].join("\n"),
    {
      path: absolutePath,
      old_string: { type: "string", description: "要替换的原文（须精确匹配）" },
      new_string: { type: "string", description: "替换后的文本" },
      replace_all: {
        type: "boolean",
        description: "为 true 时替换所有匹配；默认 false（要求唯一）",
      },
    },
    ["path", "old_string", "new_string"],
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
  ),
  tool(
    "delete",
    "Delete",
    "删除沙箱内普通文件。不能删目录。",
    {
      path: absolutePath,
    },
    ["path"],
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
  ),
  tool(
    "grep",
    "Grep",
    [
      "在沙箱内按正则搜索文件内容。",
      "精确字符串/符号搜索请用本工具，不要用 exec 调 grep/rg。",
    ].join("\n"),
    {
      pattern: { type: "string", description: "正则表达式" },
      path: {
        type: "string",
        description: "搜索的文件或目录绝对路径，默认 /",
      },
      glob: {
        type: "string",
        description: "文件名过滤，如 *.ts",
      },
      case_insensitive: {
        type: "boolean",
        description: "忽略大小写",
      },
      output_mode: {
        type: "string",
        enum: ["content", "files_with_matches", "count"],
        description: "默认 content",
      },
      context: {
        type: "integer",
        description: "匹配行上下各取几行上下文",
      },
      head_limit: {
        type: "integer",
        description: "限制返回条数，默认 100",
      },
      multiline: {
        type: "boolean",
        description: "允许多行匹配",
      },
    },
    ["pattern"],
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  ),
  tool(
    "glob",
    "Glob",
    [
      "按 glob 模式查找文件路径。",
      "不以 **/ 开头的 pattern 会自动加 **/ 前缀。",
      "结果按修改时间新→旧，最多 200 条。",
    ].join("\n"),
    {
      glob_pattern: { type: "string", description: "glob 模式，如 **/*.ts" },
      target_directory: {
        type: "string",
        description: "搜索根目录绝对路径，默认 /",
      },
    },
    ["glob_pattern"],
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  ),
  tool(
    "exec",
    "Shell",
    [
      "在沙箱内执行 shell 命令。",
      "读/写/搜文件请用 read、write、edit、grep、glob，不要用本工具代替。",
      "可用 working_directory 指定工作目录，避免 cd &&。",
      "沙箱已停止时会先开机。单路输出上限 1MB。",
    ].join("\n"),
    {
      command: {
        type: "string",
        description: "要执行的命令（经 /bin/sh -c）",
        maxLength: 16384,
      },
      working_directory: {
        type: "string",
        description: "工作目录绝对路径",
      },
    },
    ["command"],
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
  ),
];

export const MCP_TOOL_NAMES = MCP_TOOLS.map((item) => item.name);

export function mcpTools(): McpToolDefinition[] {
  return MCP_TOOLS;
}
