#!/bin/sh
# 和 ephemeral-disk.ts 里 SCAN_COMMAND 实际下发到容器的内容一致。
# 在沙箱容器里执行：sh check-ephemeral-disk.sh
# 每行是「字节数<Tab>目录」，最后一行 TOTAL 是全部文件字节合计。
# 镜像里原有的文件不计入。从 entrypoint（1 号进程）启动开始，
# 可写层里新增或整份复制上来的文件都计入，之后别的程序写的也计入。
# 挂载卷不计入。用状态变更时间：整份复制到可写层时，修改时间仍是镜像里的旧值。

start=$(stat -c %Y /proc/1 2>/dev/null || echo 0)
if ! find / -maxdepth 0 -printf . >/dev/null 2>&1 \
  || ! find / -maxdepth 0 -newerct @0 -printf . >/dev/null 2>&1; then
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
set -- "$@" -type f -newerct "@$((start - 1))" -printf '%s\t%p\n' ')'

find "$@" 2>/dev/null | awk -F '\t' '
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
  print (total + 0) "\tTOTAL"
  for (k in sums) print sums[k] "\t" k
}
'
