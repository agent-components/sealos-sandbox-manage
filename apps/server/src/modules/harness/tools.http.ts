import type { IncomingMessage, ServerResponse } from 'node:http';
import { CPU_OPTIONS, MEMORY_OPTIONS } from '../sealos/resources';

export type HarnessToolHeader = {
  name: string;
  description?: string;
  required?: boolean;
  schema?: Record<string, unknown>;
};

export type HarnessTool = {
  name: string;
  description?: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  inputSchema?: Record<string, unknown>;
  headers?: HarnessToolHeader[];
};

const idProp = {
  type: 'string',
  minLength: 1,
  description: 'Sandbox ID',
} as const;

const sandboxIdHeader: HarnessToolHeader = {
  name: 'x-sandbox-id',
  description: 'Target sandbox ID',
  required: true,
  schema: { type: 'string', minLength: 1 },
};

const createSandboxInput = {
  type: 'object',
  required: ['templateId'],
  properties: {
    templateId: { type: 'string', minLength: 1, description: 'Template ID to create from' },
    regionId: {
      type: 'string',
      enum: ['gzg', 'hzh', 'bja'],
      description: 'Region: gzg (Guangzhou), hzh (Hangzhou), or bja (Beijing). Defaults to cluster setting.',
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 48,
      description: 'Sandbox name. Auto-generated if omitted.',
    },
    cpu: { type: 'number', enum: [...CPU_OPTIONS], description: 'CPU cores' },
    memoryGi: {
      type: 'number',
      enum: MEMORY_OPTIONS.map((item) => item.gi),
      description: 'Memory in GiB',
    },
    diskGi: {
      type: 'integer',
      minimum: 1,
      maximum: 1000,
      description: 'Disk size in GiB',
    },
    env: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Environment variable name' },
          value: { type: 'string', description: 'Environment variable value' },
        },
      },
      description: 'Extra environment variables',
    },
    tags: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string' },
      description: 'Tags for filtering',
    },
  },
} as const;

/** Host catalog: sandbox lifecycle + agent FS tools. */
export const harnessTools: HarnessTool[] = [
  {
    name: 'list',
    description:
      'List sandboxes owned by the current user. Filter by tags, keyword, state, or template. Returns id, state, resources, and public URL.',
    method: 'GET',
    path: '/api/openapi/sandboxes',
    inputSchema: {
      type: 'object',
      properties: {
        tag: {
          type: 'array',
          items: { type: 'string' },
          description: 'Require all of these exact tags',
        },
        q: {
          type: 'string',
          description: 'Tag keyword search (space or comma separated)',
        },
        keyword: {
          type: 'string',
          description: 'Match sandbox id, template image, or template name',
        },
        state: {
          type: 'string',
          enum: ['starting', 'running', 'stopped', 'error'],
          description: 'Filter by sandbox state',
        },
        templateId: { type: 'string', description: 'Filter by template ID' },
        current: { type: 'integer', minimum: 1, default: 1, description: 'Page number (1-based)' },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Page size. Omit to return all matches.',
        },
      },
    },
  },
  {
    name: 'create',
    description:
      'Create a sandbox from a template. Optionally override CPU, memory, disk, name, region, env, and tags.',
    method: 'POST',
    path: '/api/openapi/sandboxes',
    inputSchema: createSandboxInput,
  },
  {
    name: 'get',
    description: 'Get one sandbox by id, including state, resources, ports, and public URL.',
    method: 'GET',
    path: '/api/openapi/sandboxes/{id}',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: idProp },
    },
  },
  {
    name: 'delete',
    description: 'Permanently delete a sandbox and its cloud resources.',
    method: 'DELETE',
    path: '/api/openapi/sandboxes/{id}',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: idProp },
    },
  },
  {
    name: 'sync_from_template',
    description:
      'Apply the linked template to this sandbox (image, command, ports, mounts, idle shutdown). Keeps current CPU/memory/disk/replicas; merges env with sandbox values winning on conflict.',
    method: 'POST',
    path: '/api/openapi/sandboxes/{id}/sync-template',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: idProp },
    },
  },
  {
    name: 'stop',
    description: 'Stop a running sandbox to free compute. Data on disk is kept.',
    method: 'POST',
    path: '/api/openapi/sandboxes/{id}/stop',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: idProp },
    },
  },
  {
    name: 'resume',
    description: 'Start a stopped sandbox so it becomes reachable again.',
    method: 'POST',
    path: '/api/openapi/sandboxes/{id}/resume',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: idProp },
    },
  },
  {
    name: 'read_file',
    description: [
      '读取沙箱内文件。',
      '文本：支持 offset（行，正数从 1 起，负数从尾部）与 limit，返回带行号内容。',
      '图片/二进制：整文件返回；offset/limit 不适用。',
      '不要用 exec 读文件。',
    ].join('\n'),
    method: 'POST',
    path: '/api/openapi/fs/read_file',
    headers: [sandboxIdHeader],
    inputSchema: {
      type: 'object',
      required: ['path'],
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description: '沙箱内的绝对路径，必须以 / 开头',
        },
        offset: {
          type: 'integer',
          description:
            '起始行。正数从文件头 1-indexed；负数从文件尾倒数。仅文本有效。',
        },
        limit: {
          type: 'integer',
          description: '读取行数。仅文本有效。',
        },
      },
    },
  },
  {
    name: 'write_file',
    description: [
      '创建或覆盖沙箱内文件。',
      '已有文件优先用 edit_file 做精确替换，避免整文件重写。',
      '会自动创建父目录。内容上限 32MB。',
    ].join('\n'),
    method: 'POST',
    path: '/api/openapi/fs/write_file',
    headers: [sandboxIdHeader],
    inputSchema: {
      type: 'object',
      required: ['path', 'contents'],
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description: '沙箱内的绝对路径，必须以 / 开头',
        },
        contents: { type: 'string', description: '文件全文内容' },
      },
    },
  },
  {
    name: 'edit_file',
    description: [
      '在文件中做精确字符串替换。',
      '默认 old_string 必须唯一匹配；replace_all 为 true 时替换全部。',
      'old_string 与 new_string 不能相同。',
    ].join('\n'),
    method: 'POST',
    path: '/api/openapi/fs/edit_file',
    headers: [sandboxIdHeader],
    inputSchema: {
      type: 'object',
      required: ['path', 'old_string', 'new_string'],
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description: '沙箱内的绝对路径，必须以 / 开头',
        },
        old_string: { type: 'string', description: '要替换的原文（须精确匹配）' },
        new_string: { type: 'string', description: '替换后的文本' },
        replace_all: {
          type: 'boolean',
          description: '为 true 时替换所有匹配；默认 false（要求唯一）',
        },
      },
    },
  },
  {
    name: 'delete_file',
    description: '删除沙箱内普通文件。不能删目录。',
    method: 'POST',
    path: '/api/openapi/fs/delete_file',
    headers: [sandboxIdHeader],
    inputSchema: {
      type: 'object',
      required: ['path'],
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description: '沙箱内的绝对路径，必须以 / 开头',
        },
      },
    },
  },
  {
    name: 'grep_file',
    description: [
      '在沙箱内按正则搜索文件内容。',
      '精确字符串/符号搜索请用本工具，不要用 exec 调 grep/rg。',
    ].join('\n'),
    method: 'POST',
    path: '/api/openapi/fs/grep_file',
    headers: [sandboxIdHeader],
    inputSchema: {
      type: 'object',
      required: ['pattern'],
      additionalProperties: false,
      properties: {
        pattern: { type: 'string', description: '正则表达式' },
        path: {
          type: 'string',
          description: '搜索的文件或目录绝对路径，默认 /',
        },
        glob: {
          type: 'string',
          description: '文件名过滤，如 *.ts',
        },
        case_insensitive: {
          type: 'boolean',
          description: '忽略大小写',
        },
        output_mode: {
          type: 'string',
          enum: ['content', 'files_with_matches', 'count'],
          description: '默认 content',
        },
        context: {
          type: 'integer',
          description: '匹配行上下各取几行上下文',
        },
        head_limit: {
          type: 'integer',
          description: '限制返回条数，默认 100',
        },
        multiline: {
          type: 'boolean',
          description: '允许多行匹配',
        },
      },
    },
  },
  {
    name: 'glob_file',
    description: [
      '按 glob 模式查找文件路径。',
      '不以 **/ 开头的 pattern 会自动加 **/ 前缀。',
      '结果按修改时间新→旧，最多 200 条。',
    ].join('\n'),
    method: 'POST',
    path: '/api/openapi/fs/glob_file',
    headers: [sandboxIdHeader],
    inputSchema: {
      type: 'object',
      required: ['glob_pattern'],
      additionalProperties: false,
      properties: {
        glob_pattern: { type: 'string', description: 'glob 模式，如 **/*.ts' },
        target_directory: {
          type: 'string',
          description: '搜索根目录绝对路径，默认 /',
        },
      },
    },
  },
  {
    name: 'exec',
    description: [
      '在沙箱内执行 shell 命令。',
      '读/写/搜文件请用 read_file、write_file、edit_file、grep_file、glob_file，不要用本工具代替。',
      '可用 working_directory 指定工作目录，避免 cd &&。',
      '沙箱已停止时会先开机。单路输出上限 1MB。',
    ].join('\n'),
    method: 'POST',
    path: '/api/openapi/fs/exec',
    headers: [sandboxIdHeader],
    inputSchema: {
      type: 'object',
      required: ['command'],
      additionalProperties: false,
      properties: {
        command: {
          type: 'string',
          description: '要执行的命令（经 /bin/sh -c）',
          maxLength: 16384,
        },
        working_directory: {
          type: 'string',
          description: '工作目录绝对路径',
        },
      },
    },
  },
];

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  res.end(payload);
}

/** 公开：GET /api/harness/tools（无需认证）。 */
export async function handleHarnessToolsHttp(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  if (path !== '/api/harness/tools') return false;

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }

  sendJson(res, 200, { tools: harnessTools });
  return true;
}
