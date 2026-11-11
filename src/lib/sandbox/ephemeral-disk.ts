import { requireUser } from "@/lib/auth/resolve";
import { execInPod, readContainerEphemeralUsage } from "@/lib/sealos/kube";
import { resolveRunningSandbox } from "@/lib/sandbox/command";

/** Sealos 对容器可写层的限制是 100Mi。 */
export const EPHEMERAL_LIMIT_BYTES = 100 * 1024 * 1024;

export type EphemeralDirectory = {
  path: string;
  bytes: number;
};

export type EphemeralDiskReport = {
  limitBytes: number;
  /** 用来对照上限的占用。优先是节点统计的可写层加容器日志。 */
  usedBytes: number;
  writableBytes: number | null;
  logBytes: number | null;
  usageSource: "kubelet" | "files";
  directories: EphemeralDirectory[];
  checkedAt: string;
  detail: string | null;
};

/**
 * 只统计容器启动之后写入或改动的普通文件，并停在根文件系统上。
 * 镜像里原有的文件时间更早，挂载的持久磁盘是别的文件系统，两者都不会进来。
 * 改动镜像里的文件会整文件复制到可写层，修改时间也会更新，因此会计入。
 */
const SCAN_COMMAND = `
start=$(stat -c %Y /proc/1 2>/dev/null || echo 0)
if ! find / -maxdepth 0 -printf . >/dev/null 2>&1; then
  echo UNSUPPORTED
  exit 0
fi
find / -xdev -type f -newermt "@$((start - 1))" -printf '%s\\t%p\\n' 2>/dev/null | awk -F '\\t' '
function bucket(path,   n, a, i, dirs, b) {
  n = split(path, a, "/")
  dirs = n - 2
  if (dirs < 1) dirs = 1
  if (dirs > 3) dirs = 3
  b = ""
  for (i = 2; i < 2 + dirs; i++) b = b "/" a[i]
  return b
}
{
  bytes = $1 + 0
  total += bytes
  key = bucket($2)
  sums[key] += bytes
}
END {
  print (total + 0) "\\tTOTAL"
  for (k in sums) print sums[k] "\\t" k
}
'
`.trim();

function parseScan(stdout: string): {
  total: number;
  directories: EphemeralDirectory[];
  unsupported: boolean;
} {
  const text = stdout.trim();
  if (!text || text === "UNSUPPORTED") {
    return { total: 0, directories: [], unsupported: text === "UNSUPPORTED" };
  }
  let total = 0;
  const directories: EphemeralDirectory[] = [];
  for (const line of text.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab <= 0) continue;
    const bytes = Number(line.slice(0, tab));
    const path = line.slice(tab + 1).trim();
    if (!Number.isFinite(bytes) || bytes < 0 || !path) continue;
    if (path === "TOTAL") {
      total = bytes;
      continue;
    }
    if (!path.startsWith("/")) continue;
    directories.push({ path, bytes });
  }
  directories.sort((a, b) => b.bytes - a.bytes);
  return {
    total,
    directories,
    unsupported: false,
  };
}

export async function inspectEphemeralDisk(
  id: string,
  req: Request,
): Promise<EphemeralDiskReport> {
  await requireUser(req);
  const target = await resolveRunningSandbox(id);
  const [usage, scan] = await Promise.all([
    readContainerEphemeralUsage(
      target.kubeconfig,
      target.pod,
      target.container,
    ).catch(() => null),
    execInPod(target.kubeconfig, {
      pod: target.pod,
      container: target.container,
      command: ["/bin/sh", "-c", SCAN_COMMAND],
      timeoutMs: 40_000,
    }),
  ]);

  const parsed = parseScan(scan.stdout);
  const kubeletWritable = usage?.writableBytes ?? null;
  const logBytes = usage?.logBytes ?? null;
  const usageSource = kubeletWritable === null ? "files" : "kubelet";
  const usedBytes =
    kubeletWritable === null
      ? parsed.total
      : kubeletWritable + (logBytes ?? 0);

  let detail: string | null = null;
  if (parsed.unsupported) {
    detail =
      "沙箱里的 find 无法按修改时间筛选，暂时列不出目录。上方数字仍是节点统计的可写层占用。";
  } else if (
    scan.exitCode !== 0 &&
    parsed.directories.length === 0 &&
    parsed.total === 0
  ) {
    detail = scan.stderr.trim() || "目录扫描失败";
  } else if (
    kubeletWritable !== null &&
    kubeletWritable > 8 * 1024 * 1024 &&
    parsed.total * 2 < kubeletWritable
  ) {
    detail =
      "目录合计明显小于可写层。表里只列出启动后改过修改时间的文件，按旧时间写入的文件不会出现。";
  }

  return {
    limitBytes: EPHEMERAL_LIMIT_BYTES,
    usedBytes,
    writableBytes: kubeletWritable,
    logBytes,
    usageSource,
    directories: parsed.directories,
    checkedAt: new Date().toISOString(),
    detail,
  };
}
