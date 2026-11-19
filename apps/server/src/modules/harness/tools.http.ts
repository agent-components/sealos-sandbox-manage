import type { IncomingMessage, ServerResponse } from 'node:http';

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

const sandboxIdHeader: HarnessToolHeader = {
  name: 'x-sandbox-id',
  description: 'Target sandbox ID',
  required: true,
  schema: { type: 'string', minLength: 1 },
};

/** Agent FS tools for the host; sandbox selected via x-sandbox-id. */
export const harnessTools: HarnessTool[] = [
  {
    name: 'read',
    description:
      'Read a text file from the sandbox by absolute path. Optional offset/limit select line ranges (1-based; negative offset counts from the end). Max 32MB.',
    method: 'POST',
    path: '/api/openapi/fs/read',
    headers: [sandboxIdHeader],
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: 'Absolute path inside the sandbox',
        },
        offset: {
          type: 'integer',
          description: 'Start line (1-based). Negative counts from the end.',
        },
        limit: {
          type: 'integer',
          minimum: 0,
          description: 'Max number of lines to return',
        },
      },
    },
  },
  {
    name: 'write',
    description:
      'Create or overwrite a text file in the sandbox. Parent directories are created automatically. Max 32MB.',
    method: 'POST',
    path: '/api/openapi/fs/write',
    headers: [sandboxIdHeader],
    inputSchema: {
      type: 'object',
      required: ['path', 'contents'],
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: 'Absolute path inside the sandbox',
        },
        contents: {
          type: 'string',
          description: 'Full file contents to write',
        },
      },
    },
  },
  {
    name: 'edit',
    description:
      'Replace an exact string in a sandbox file. Fails if old_string is missing or matches multiple times unless replace_all is true.',
    method: 'POST',
    path: '/api/openapi/fs/edit',
    headers: [sandboxIdHeader],
    inputSchema: {
      type: 'object',
      required: ['path', 'old_string', 'new_string'],
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: 'Absolute path inside the sandbox',
        },
        old_string: {
          type: 'string',
          minLength: 1,
          description: 'Exact text to find',
        },
        new_string: {
          type: 'string',
          description: 'Replacement text',
        },
        replace_all: {
          type: 'boolean',
          description: 'Replace every match instead of requiring a unique match',
        },
      },
    },
  },
  {
    name: 'delete',
    description: 'Delete a regular file in the sandbox. Directories are not allowed.',
    method: 'POST',
    path: '/api/openapi/fs/delete',
    headers: [sandboxIdHeader],
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: 'Absolute path of the file to delete',
        },
      },
    },
  },
  {
    name: 'grep',
    description:
      'Search file contents in the sandbox with a regex. Can return matching lines, file paths, or match counts.',
    method: 'POST',
    path: '/api/openapi/fs/grep',
    headers: [sandboxIdHeader],
    inputSchema: {
      type: 'object',
      required: ['pattern'],
      properties: {
        pattern: {
          type: 'string',
          minLength: 1,
          description: 'Regular expression to search for',
        },
        path: {
          type: 'string',
          description: 'File or directory to search (default /)',
        },
        glob: {
          type: 'string',
          description: 'Only search paths matching this glob',
        },
        case_insensitive: {
          type: 'boolean',
          description: 'Case-insensitive match',
        },
        output_mode: {
          type: 'string',
          enum: ['content', 'files_with_matches', 'count'],
          description: 'Result shape (default content)',
        },
        context: {
          type: 'integer',
          minimum: 0,
          description: 'Context lines around each match',
        },
        head_limit: {
          type: 'integer',
          minimum: 0,
          description: 'Max matches to return',
        },
        multiline: {
          type: 'boolean',
          description: 'Allow patterns to span lines',
        },
      },
    },
  },
  {
    name: 'glob',
    description:
      'Find files in the sandbox by glob pattern. Returns matching absolute paths (capped).',
    method: 'POST',
    path: '/api/openapi/fs/glob',
    headers: [sandboxIdHeader],
    inputSchema: {
      type: 'object',
      required: ['glob_pattern'],
      properties: {
        glob_pattern: {
          type: 'string',
          minLength: 1,
          description: 'Glob pattern, e.g. **/*.ts',
        },
        target_directory: {
          type: 'string',
          description: 'Directory to search under (default /)',
        },
      },
    },
  },
  {
    name: 'exec',
    description:
      'Run a shell command in the sandbox and return exit code, stdout, and stderr. Starts the sandbox first if it is stopped. Times out after about 60 seconds.',
    method: 'POST',
    path: '/api/openapi/fs/exec',
    headers: [sandboxIdHeader],
    inputSchema: {
      type: 'object',
      required: ['command'],
      properties: {
        command: {
          type: 'string',
          minLength: 1,
          maxLength: 16384,
          description: 'Shell command to run',
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
