import {
  deleteSandboxFile,
  editSandboxFile,
  globSandbox,
  grepSandbox,
  readSandboxText,
  sniffSandboxPath,
  writeSandboxFile,
  type GrepMode,
} from './agent-fs';
import { openSandboxArtifact } from './artifact';
import { resolveSandboxForCommand } from './command';
import { beginMcpActivity, endMcpActivity } from './idle';
import {
  ArtifactPathSchema,
  RunSandboxCommandSchema,
} from './schema';
import { ExecCancelledError, execInPod } from '../sealos/kube';

function asRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

async function withActivity<T>(
  sandboxId: string,
  run: () => Promise<T>,
  opts?: { touchOnError?: (status: number) => boolean },
): Promise<T> {
  await beginMcpActivity(sandboxId);
  try {
    const body = await run();
    await endMcpActivity(sandboxId, { touch: true });
    return body;
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'status' in error
        ? Number((error as { status: unknown }).status)
        : 500;
    const touch = opts?.touchOnError?.(status) ?? (status !== 401 && status !== 403);
    await endMcpActivity(sandboxId, { touch });
    throw error;
  }
}

async function readWebStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const parts: Buffer[] = [];
  while (true) {
    const piece = await reader.read();
    if (piece.done) break;
    parts.push(Buffer.from(piece.value));
  }
  return Buffer.concat(parts);
}

/** 对齐 main MCP read：文本行读；图片/二进制整文件返回。 */
export async function runFsRead(
  sandboxId: string,
  raw: unknown,
  signal?: AbortSignal,
) {
  const args = asRecord(raw);
  const path = String(args.path ?? '');
  const offset = typeof args.offset === 'number' ? args.offset : undefined;
  const limit = typeof args.limit === 'number' ? args.limit : undefined;

  return withActivity(sandboxId, async () => {
    const sniffed = await sniffSandboxPath(sandboxId, path, signal);
    if (sniffed.kind === 'image' || sniffed.kind === 'binary') {
      const artifact = await openSandboxArtifact(sandboxId, path, signal);
      if (artifact.kind === 'image') {
        return {
          path: artifact.path,
          mediaType: artifact.mediaType,
          encoding: 'base64' as const,
          data: artifact.base64,
          bytes: artifact.bytes,
        };
      }
      const bytes = await readWebStream(artifact.stream);
      return {
        path: artifact.path,
        mediaType: artifact.mediaType,
        encoding: 'base64' as const,
        data: bytes.toString('base64'),
        bytes: bytes.length,
      };
    }

    const result = await readSandboxText(sandboxId, path, {
      offset,
      limit,
      signal,
    });
    return {
      path: result.path,
      totalLines: result.totalLines,
      encoding: 'utf8' as const,
      data: result.content,
    };
  });
}

export async function runFsWrite(
  sandboxId: string,
  raw: unknown,
  signal?: AbortSignal,
) {
  const args = asRecord(raw);
  return withActivity(sandboxId, () =>
    writeSandboxFile(
      sandboxId,
      String(args.path ?? ''),
      String(args.contents ?? ''),
      signal,
    ),
  );
}

export async function runFsEdit(
  sandboxId: string,
  raw: unknown,
  signal?: AbortSignal,
) {
  const args = asRecord(raw);
  return withActivity(sandboxId, () =>
    editSandboxFile(
      sandboxId,
      String(args.path ?? ''),
      String(args.old_string ?? args.oldString ?? ''),
      String(args.new_string ?? args.newString ?? ''),
      args.replace_all === true || args.replaceAll === true,
      signal,
    ),
  );
}

export async function runFsDelete(
  sandboxId: string,
  raw: unknown,
  signal?: AbortSignal,
) {
  const args = asRecord(raw);
  return withActivity(sandboxId, () =>
    deleteSandboxFile(sandboxId, String(args.path ?? ''), signal),
  );
}

export async function runFsGrep(
  sandboxId: string,
  raw: unknown,
  signal?: AbortSignal,
) {
  const args = asRecord(raw);
  const mode = args.output_mode ?? args.outputMode;
  const outputMode: GrepMode | undefined =
    mode === 'content' || mode === 'files_with_matches' || mode === 'count'
      ? mode
      : undefined;

  return withActivity(sandboxId, async () => {
    const result = await grepSandbox(sandboxId, {
      pattern: String(args.pattern ?? ''),
      path: typeof args.path === 'string' ? args.path : undefined,
      glob: typeof args.glob === 'string' ? args.glob : undefined,
      caseInsensitive: args.case_insensitive === true || args.caseInsensitive === true,
      outputMode,
      context: typeof args.context === 'number' ? args.context : undefined,
      headLimit:
        typeof args.head_limit === 'number'
          ? args.head_limit
          : typeof args.headLimit === 'number'
            ? args.headLimit
            : undefined,
      multiline: args.multiline === true,
      signal,
    });
    return { text: result.text || '(无匹配)' };
  });
}

export async function runFsGlob(
  sandboxId: string,
  raw: unknown,
  signal?: AbortSignal,
) {
  const args = asRecord(raw);
  return withActivity(sandboxId, async () => {
    const result = await globSandbox(
      sandboxId,
      String(args.glob_pattern ?? args.globPattern ?? args.pattern ?? ''),
      typeof args.target_directory === 'string'
        ? args.target_directory
        : typeof args.targetDirectory === 'string'
          ? args.targetDirectory
          : undefined,
      signal,
    );
    return {
      paths: result.paths,
      count: result.paths.length,
      text: result.paths.join('\n') || '(无匹配)',
    };
  });
}

/** 对齐 main MCP exec：working_directory、不限时；已停止先开机。 */
export async function runFsExec(
  sandboxId: string,
  raw: unknown,
  signal?: AbortSignal,
) {
  const args = asRecord(raw);
  const parsed = RunSandboxCommandSchema.parse({ command: args.command });

  let workingDirectory: string | undefined;
  if (args.working_directory !== undefined && args.working_directory !== null) {
    workingDirectory = ArtifactPathSchema.parse(args.working_directory);
  } else if (args.workingDirectory !== undefined && args.workingDirectory !== null) {
    workingDirectory = ArtifactPathSchema.parse(args.workingDirectory);
  }

  return withActivity(sandboxId, async () => {
    const target = await resolveSandboxForCommand(sandboxId, signal);
    const command = workingDirectory
      ? [
          '/bin/sh',
          '-c',
          'cd -- "$1" && /bin/sh -c "$2"',
          'exec',
          workingDirectory,
          parsed.command,
        ]
      : ['/bin/sh', '-c', parsed.command];

    try {
      const result = await execInPod(target.kubeconfig, {
        pod: target.pod,
        container: target.container,
        command,
        timeoutMs: 0,
        signal,
      });
      return {
        ok: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      if (error instanceof ExecCancelledError || signal?.aborted) {
        const cancelled = new Error('命令已取消');
        (cancelled as Error & { status: number }).status = 499;
        throw cancelled;
      }
      throw error;
    }
  });
}
