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

/** Public catalog for the host; `{id}` is filled from inputSchema.id. */
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
    name: 'run_command',
    description:
      'Run a shell command inside the sandbox and return exit code, stdout, and stderr. Starts the sandbox first if it is stopped. Times out after about 60 seconds.',
    method: 'POST',
    path: '/api/openapi/sandboxes/{id}/commands',
    inputSchema: {
      type: 'object',
      required: ['id', 'command'],
      properties: {
        id: idProp,
        command: {
          type: 'string',
          minLength: 1,
          maxLength: 16384,
          description: 'Shell command to run',
        },
      },
    },
  },
  {
    name: 'get_artifact',
    description:
      'Read a file from the running sandbox by absolute path (max 32MB). Text is returned as text; images as base64 JSON; other types as a binary download.',
    method: 'GET',
    path: '/api/openapi/sandboxes/{id}/artifacts',
    inputSchema: {
      type: 'object',
      required: ['id', 'path'],
      properties: {
        id: idProp,
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: 'Absolute path inside the sandbox',
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
