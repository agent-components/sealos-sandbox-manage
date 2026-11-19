const OPERATION_LABEL: Record<string, string> = {
  listSandboxes: '查看沙箱列表',
  createSandbox: '创建沙箱',
  getSandbox: '查看沙箱',
  deleteSandbox: '删除沙箱',
  syncSandboxFromTemplate: '同步模板',
  stopSandbox: '关机',
  resumeSandbox: '开机',
  runSandboxCommand: '执行命令',
  getSandboxArtifact: '下载产物',
  getBilling: '用量账单',
};

/** 调用日志中的 operation 展示名。 */
export function operationLabel(name: string) {
  return OPERATION_LABEL[name] ?? name;
}
