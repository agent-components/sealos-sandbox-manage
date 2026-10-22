import { ARTIFACT_MAX_BYTES, classifyArtifact } from "@/lib/sandbox/artifact";
import { ArtifactPathSchema } from "@/lib/sandbox/schema";
import {
  resolveRunningSandbox,
  resolveSandboxForCommand,
} from "@/lib/sandbox/command";
import { SealosApiError } from "@/lib/sealos/errors";
import { execInPod } from "@/lib/sealos/kube";

const GLOB_MAX = 200;
const GREP_DEFAULT_HEAD = 100;
const SNIFF_BYTES = 8192;

const READ_TEXT_SCRIPT = `
import sys
path = sys.argv[1]
offset_raw = sys.argv[2]
limit_raw = sys.argv[3]
with open(path, "r", encoding="utf-8", errors="replace") as f:
    lines = f.readlines()
total = len(lines)
if offset_raw == "":
    start = 0
else:
    offset = int(offset_raw)
    if offset == 0:
        start = 0
    elif offset > 0:
        start = offset - 1
    else:
        start = max(0, total + offset)
if limit_raw == "":
    end = total
else:
    end = min(total, start + max(0, int(limit_raw)))
start = max(0, min(start, total))
end = max(start, min(end, total))
for i in range(start, end):
    text = lines[i].rstrip("\\n\\r")
    print(f"{i + 1}|{text}")
print(f"__META__\\t{total}\\t{start + 1 if total else 0}\\t{end}", file=sys.stderr)
`.trim();

const GREP_SCRIPT = `
import os, re, sys, fnmatch
root = sys.argv[1]
pattern = sys.argv[2]
glob_pat = sys.argv[3]
case_insensitive = sys.argv[4] == "1"
output_mode = sys.argv[5]
context = int(sys.argv[6])
head_limit = int(sys.argv[7])
multiline = sys.argv[8] == "1"
flags = re.MULTILINE | (re.IGNORECASE if case_insensitive else 0) | (re.DOTALL if multiline else 0)
try:
    rx = re.compile(pattern, flags)
except re.error as e:
    print(f"invalid pattern: {e}", file=sys.stderr)
    sys.exit(2)

def want(path):
    if not glob_pat:
        return True
    name = os.path.basename(path)
    return fnmatch.fnmatch(name, glob_pat) or fnmatch.fnmatch(path, glob_pat)

matches = []
file_counts = {}
if os.path.isfile(root):
    paths = [root]
else:
    paths = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules")]
        for name in filenames:
            paths.append(os.path.join(dirpath, name))

for path in paths:
    if not want(path):
        continue
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except Exception:
        continue
    if not text:
        continue
    lines = text.splitlines()
    if multiline:
        for m in rx.finditer(text):
            line_no = text.count("\\n", 0, m.start()) + 1
            file_counts[path] = file_counts.get(path, 0) + 1
            if output_mode == "content":
                start = max(0, line_no - 1 - context)
                end = min(len(lines), line_no + context)
                chunk = []
                for i in range(start, end):
                    prefix = ":" if i == line_no - 1 else "-"
                    chunk.append(f"{path}{prefix}{i + 1}:{lines[i]}")
                matches.append("\\n".join(chunk))
            if head_limit > 0 and (
                (output_mode == "content" and len(matches) >= head_limit)
                or (output_mode != "content" and len(file_counts) >= head_limit)
            ):
                break
        if head_limit > 0 and (
            (output_mode == "content" and len(matches) >= head_limit)
            or (output_mode != "content" and len(file_counts) >= head_limit)
        ):
            break
        continue
    for idx, line in enumerate(lines):
        if not rx.search(line):
            continue
        file_counts[path] = file_counts.get(path, 0) + 1
        if output_mode == "content":
            start = max(0, idx - context)
            end = min(len(lines), idx + 1 + context)
            chunk = []
            for i in range(start, end):
                prefix = ":" if i == idx else "-"
                chunk.append(f"{path}{prefix}{i + 1}:{lines[i]}")
            matches.append("\\n".join(chunk))
        if head_limit > 0 and (
            (output_mode == "content" and len(matches) >= head_limit)
            or (output_mode == "files_with_matches" and len(file_counts) >= head_limit)
            or (output_mode == "count" and sum(file_counts.values()) >= head_limit)
        ):
            break
    if head_limit > 0 and (
        (output_mode == "content" and len(matches) >= head_limit)
        or (output_mode == "files_with_matches" and len(file_counts) >= head_limit)
    ):
        break

if output_mode == "files_with_matches":
    for path in file_counts:
        print(path)
elif output_mode == "count":
    for path, n in file_counts.items():
        print(f"{path}:{n}")
else:
    for item in matches:
        print(item)
        print("--")
`.trim();

const GLOB_SCRIPT = `
import os, sys
from pathlib import Path
root = Path(sys.argv[1])
pattern = sys.argv[2]
limit = int(sys.argv[3])
if not pattern.startswith("**/"):
    pattern = "**/" + pattern
if not root.exists():
    print(f"path not found: {root}", file=sys.stderr)
    sys.exit(1)
entries = []
try:
    for path in root.glob(pattern):
        if path.is_file():
            try:
                mtime = path.stat().st_mtime
            except OSError:
                mtime = 0
            entries.append((mtime, str(path)))
except Exception as e:
    print(str(e), file=sys.stderr)
    sys.exit(1)
entries.sort(key=lambda x: x[0], reverse=True)
for _, path in entries[:limit]:
    print(path)
`.trim();

function assertPath(raw: string): string {
  return ArtifactPathSchema.parse(raw);
}

function execFailure(
  stderr: string,
  exitCode: number,
  fallback: string
): Error {
  const text = stderr.trim();
  if (/no such file|not found|cannot open/i.test(text)) {
    return new SealosApiError("文件不存在", 404);
  }
  if (/is a directory/i.test(text)) {
    return new SealosApiError("路径是目录", 400);
  }
  if (/permission denied/i.test(text)) {
    return new SealosApiError("权限不足", 403);
  }
  return new SealosApiError(text || `${fallback}（${exitCode}）`, 400);
}

/** 嗅探路径类型：text / image / binary。 */
export async function sniffSandboxPath(
  id: string,
  rawPath: string,
  signal?: AbortSignal
): Promise<{
  path: string;
  kind: "text" | "image" | "binary";
  mediaType: string;
}> {
  const path = assertPath(rawPath);
  const target = await resolveRunningSandbox(id);
  const parts: Buffer[] = [];
  const result = await execInPod(target.kubeconfig, {
    pod: target.pod,
    container: target.container,
    command: ["head", "-c", String(SNIFF_BYTES), "--", path],
    timeoutMs: 60_000,
    maxBytes: SNIFF_BYTES + 1024,
    retainStdout: false,
    signal,
    onStdout: (chunk) => parts.push(chunk),
  });
  if (result.exitCode !== 0) {
    throw execFailure(result.stderr, result.exitCode, "无法读取文件");
  }
  const sample = Buffer.concat(parts);
  const classified = classifyArtifact(path, sample);
  return { path, kind: classified.kind, mediaType: classified.mediaType };
}

/** 按行读取文本文件；offset 正数从 1 起，负数从尾部倒数。 */
export async function readSandboxText(
  id: string,
  rawPath: string,
  opts?: { offset?: number; limit?: number; signal?: AbortSignal }
): Promise<{ path: string; content: string; totalLines: number }> {
  const path = assertPath(rawPath);
  const target = await resolveRunningSandbox(id);
  const offsetRaw = opts?.offset === undefined ? "" : String(opts.offset);
  const limitRaw = opts?.limit === undefined ? "" : String(opts.limit);
  const result = await execInPod(target.kubeconfig, {
    pod: target.pod,
    container: target.container,
    command: ["python3", "-c", READ_TEXT_SCRIPT, path, offsetRaw, limitRaw],
    timeoutMs: 120_000,
    maxBytes: ARTIFACT_MAX_BYTES,
    tooLargeMessage: "文件超过 32MB",
    signal: opts?.signal,
  });
  if (result.exitCode !== 0) {
    throw execFailure(result.stderr, result.exitCode, "读取文件失败");
  }
  const meta = result.stderr.trim().split("\t");
  const totalLines = Number(meta[1] ?? 0) || 0;
  return { path, content: result.stdout.replace(/\n$/, ""), totalLines };
}

/** 写入或覆盖文件；自动创建父目录。 */
export async function writeSandboxFile(
  id: string,
  rawPath: string,
  contents: string,
  signal?: AbortSignal
): Promise<{ path: string; bytes: number }> {
  const path = assertPath(rawPath);
  if (typeof contents !== "string") {
    throw new SealosApiError("contents 必须是字符串", 400);
  }
  const data = Buffer.from(contents, "utf8");
  if (data.length > ARTIFACT_MAX_BYTES) {
    throw new SealosApiError("文件内容超过 32MB", 413);
  }
  const target = await resolveSandboxForCommand(id, signal);
  const result = await execInPod(target.kubeconfig, {
    pod: target.pod,
    container: target.container,
    command: [
      "sh",
      "-c",
      'mkdir -p -- "$(dirname -- "$2")" && head -c "$1" > "$2"',
      "write",
      String(data.length),
      path,
    ],
    stdin: data,
    timeoutMs: 120_000,
    signal,
  });
  if (result.exitCode !== 0) {
    throw execFailure(result.stderr, result.exitCode, "写入文件失败");
  }
  return { path, bytes: data.length };
}

/** 精确字符串替换（对标 StrReplace）。 */
export async function editSandboxFile(
  id: string,
  rawPath: string,
  oldString: string,
  newString: string,
  replaceAll = false,
  signal?: AbortSignal
): Promise<{ path: string; replacements: number }> {
  const path = assertPath(rawPath);
  if (typeof oldString !== "string" || typeof newString !== "string") {
    throw new SealosApiError("old_string / new_string 必须是字符串", 400);
  }
  if (oldString === newString) {
    throw new SealosApiError("old_string 与 new_string 相同", 400);
  }
  if (!oldString) {
    throw new SealosApiError("old_string 不能为空", 400);
  }
  const target = await resolveSandboxForCommand(id, signal);
  const read = await execInPod(target.kubeconfig, {
    pod: target.pod,
    container: target.container,
    command: ["cat", "--", path],
    timeoutMs: 120_000,
    maxBytes: ARTIFACT_MAX_BYTES,
    tooLargeMessage: "文件超过 32MB",
    signal,
  });
  if (read.exitCode !== 0) {
    throw execFailure(read.stderr, read.exitCode, "读取文件失败");
  }
  const original = read.stdout;
  let count = 0;
  let index = 0;
  while (true) {
    const found = original.indexOf(oldString, index);
    if (found < 0) break;
    count += 1;
    index = found + oldString.length;
  }
  if (count === 0) {
    throw new SealosApiError("未找到 old_string", 400);
  }
  if (!replaceAll && count > 1) {
    throw new SealosApiError(
      "old_string 匹配到多处，请提供更多上下文或设置 replace_all",
      400
    );
  }
  const next = replaceAll
    ? original.split(oldString).join(newString)
    : original.replace(oldString, newString);
  const data = Buffer.from(next, "utf8");
  if (data.length > ARTIFACT_MAX_BYTES) {
    throw new SealosApiError("替换后文件超过 32MB", 413);
  }
  const write = await execInPod(target.kubeconfig, {
    pod: target.pod,
    container: target.container,
    command: [
      "sh",
      "-c",
      'mkdir -p -- "$(dirname -- "$2")" && head -c "$1" > "$2"',
      "write",
      String(data.length),
      path,
    ],
    stdin: data,
    timeoutMs: 120_000,
    signal,
  });
  if (write.exitCode !== 0) {
    throw execFailure(write.stderr, write.exitCode, "写入文件失败");
  }
  return { path, replacements: replaceAll ? count : 1 };
}

/** 删除普通文件。 */
export async function deleteSandboxFile(
  id: string,
  rawPath: string,
  signal?: AbortSignal
): Promise<{ path: string }> {
  const path = assertPath(rawPath);
  const target = await resolveSandboxForCommand(id, signal);
  const check = await execInPod(target.kubeconfig, {
    pod: target.pod,
    container: target.container,
    command: [
      "sh",
      "-c",
      'if [ -d "$1" ]; then echo DIR; elif [ -f "$1" ]; then echo FILE; elif [ -e "$1" ]; then echo OTHER; else echo MISSING; fi',
      "check",
      path,
    ],
    timeoutMs: 30_000,
    signal,
  });
  const kind = check.stdout.trim();
  if (kind === "MISSING") throw new SealosApiError("文件不存在", 404);
  if (kind === "DIR") throw new SealosApiError("路径是目录，不能删除", 400);
  if (kind !== "FILE") throw new SealosApiError("只能删除普通文件", 400);
  const result = await execInPod(target.kubeconfig, {
    pod: target.pod,
    container: target.container,
    command: ["rm", "-f", "--", path],
    timeoutMs: 30_000,
    signal,
  });
  if (result.exitCode !== 0) {
    throw execFailure(result.stderr, result.exitCode, "删除失败");
  }
  return { path };
}

export type GrepMode = "content" | "files_with_matches" | "count";

export async function grepSandbox(
  id: string,
  opts: {
    pattern: string;
    path?: string;
    glob?: string;
    caseInsensitive?: boolean;
    outputMode?: GrepMode;
    context?: number;
    headLimit?: number;
    multiline?: boolean;
    signal?: AbortSignal;
  }
): Promise<{ text: string }> {
  if (!opts.pattern || typeof opts.pattern !== "string") {
    throw new SealosApiError("pattern 必填", 400);
  }
  const root = assertPath(opts.path ?? "/");
  const target = await resolveSandboxForCommand(id, opts.signal);
  const result = await execInPod(target.kubeconfig, {
    pod: target.pod,
    container: target.container,
    command: [
      "python3",
      "-c",
      GREP_SCRIPT,
      root,
      opts.pattern,
      opts.glob ?? "",
      opts.caseInsensitive ? "1" : "0",
      opts.outputMode ?? "content",
      String(Math.max(0, opts.context ?? 0)),
      String(Math.max(0, opts.headLimit ?? GREP_DEFAULT_HEAD)),
      opts.multiline ? "1" : "0",
    ],
    timeoutMs: 180_000,
    maxBytes: ARTIFACT_MAX_BYTES,
    signal: opts.signal,
  });
  if (result.exitCode === 2) {
    throw new SealosApiError(result.stderr.trim() || "无效的正则", 400);
  }
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    throw execFailure(result.stderr, result.exitCode, "搜索失败");
  }
  return { text: result.stdout.trimEnd() };
}

export async function globSandbox(
  id: string,
  globPattern: string,
  targetDirectory?: string,
  signal?: AbortSignal
): Promise<{ paths: string[] }> {
  if (!globPattern || typeof globPattern !== "string") {
    throw new SealosApiError("glob_pattern 必填", 400);
  }
  const root = assertPath(targetDirectory ?? "/");
  const target = await resolveSandboxForCommand(id, signal);
  const result = await execInPod(target.kubeconfig, {
    pod: target.pod,
    container: target.container,
    command: [
      "python3",
      "-c",
      GLOB_SCRIPT,
      root,
      globPattern,
      String(GLOB_MAX),
    ],
    timeoutMs: 120_000,
    maxBytes: ARTIFACT_MAX_BYTES,
    signal,
  });
  if (result.exitCode !== 0) {
    throw execFailure(result.stderr, result.exitCode, "glob 失败");
  }
  const paths = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return { paths };
}
