#!/bin/sh
# 和 ephemeral-disk.ts 里 SCAN_COMMAND 实际下发到容器的内容一致。
# 在沙箱容器里执行：sh check-ephemeral-disk.sh
# 每行是「占用字节<Tab>目录」，最后一行 TOTAL 是合计。
# 只统计 overlay 上层的增量。镜像解包会跨过 1 号进程启动时刻，尾部大约再写半秒。
# 上层目录在宿主机上，容器里看不到，所以从启动 1 秒之后开始算，避开这段镜像尾部。
# 字节数是磁盘块，和 Sealos 计入 100MB 的方式一致。挂载卷不计入。

hz=$(getconf CLK_TCK)
btime=$(awk '/^btime /{print $2}' /proc/stat)
ticks=$(awk '{print $22}' /proc/1/stat)
start=$(awk -v b="$btime" -v t="$ticks" -v h="$hz" 'BEGIN{printf "%.6f", b + t / h}')
if ! find / -maxdepth 0 -printf . >/dev/null 2>&1; then
  echo UNSUPPORTED
  exit 0
fi

set -- / -xdev '('
while IFS= read -r mp; do
  [ -n "$mp" ] || continue
  set -- "$@" -path "$mp" -prune -o
done <<EOF
$(awk '$5 != "/" { mp = $5; gsub(/\\040/, " ", mp); if (!seen[mp]++) print mp }' /proc/self/mountinfo)
EOF
set -- "$@" '(' -type f -o -type d ')' -printf '%C@\t%b\t%p\n' ')'

find "$@" 2>/dev/null | awk -F '\t' -v start="$start" '
function bucket(path,   n, a, i, dirs, b) {
  n = split(path, a, "/")
  dirs = n - 2
  if (dirs < 1) dirs = 1
  if (dirs > 3) dirs = 3
  b = ""
  for (i = 2; i < 2 + dirs; i++) b = b "/" a[i]
  return b
}
$1+0 <= start+1 { next }
{
  path = $3
  if (path == "/") next
  bytes = ($2 + 0) * 512
  total += bytes
  key = bucket(path)
  sums[key] += bytes
}
END {
  print (total + 0) "\tTOTAL"
  for (k in sums) if (sums[k] > 0) print sums[k] "\t" k
}
'
