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
 * 镜像里原有的文件不计入。从 entrypoint（1 号进程）启动开始，
 * 可写层里新增或整份复制上来的文件都计入，之后别的程序写的也计入。
 * 挂载卷不计入。用状态变更时间而不是修改时间：整份复制到可写层时，修改时间仍是镜像里的旧值。
 */
const SCAN_COMMAND = `
start=$(stat -c %Y /proc/1 2>/dev/null || echo 0)
if ! find / -maxdepth 0 -printf . >/dev/null 2>&1 \\
  || ! find / -maxdepth 0 -newerct @0 -printf . >/dev/null 2>&1; then
  echo UNSUPPORTED
  exit 0
fi

set -- / -xdev '('
while IFS= read -r mp; do
  [ -n "$mp" ] || continue
  set -- "$@" -path "$mp" -prune -o
done <<EOF
$(awk '$5 != "/" { mp = $5; gsub(/\\\\040/, " ", mp); if (!seen[mp]++) print mp }' /proc/self/mountinfo)
EOF
set -- "$@" -type f -newerct "@$((start - 1))" -printf '%s\\t%p\\n' ')'

find "$@" 2>/dev/null | awk -F '\\t' '
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
      "沙箱里的 find 无法按状态变更时间筛选，暂时列不出目录。上方数字仍是节点统计的可写层占用。";
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
      "目录合计明显小于可写层。容器日志不在这些目录里，被进程占着的已删除文件也不会出现。";
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
