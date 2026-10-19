function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少必要环境变量：${name}`);
  }
  return value;
}

export function getSealosConfig() {
  return {
    launchpadBase: required("SEALOS_LAUNCHPAD_BASE").replace(/\/$/, ""),
    kubeconfigPath: required("SEALOS_KUBECONFIG_PATH"),
  };
}
