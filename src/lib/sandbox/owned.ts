import { resolveKubeconfig } from "@/lib/auth/resolve";
import { isOwnedBy } from "@/lib/sandbox/ownership";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";

export async function listOwnedSandboxIds(username: string): Promise<Set<string>> {
  const kubeconfig = await resolveKubeconfig();
  const client = createLaunchpadClient({ kubeconfig });
  const apps = await client.listApps();
  return new Set(
    apps.filter((app) => isOwnedBy(app, username)).map((app) => app.name),
  );
}

export async function findUnownedSandboxIds(
  username: string,
  sandboxIds: string[],
): Promise<string[]> {
  if (sandboxIds.length === 0) return [];
  const owned = await listOwnedSandboxIds(username);
  return sandboxIds.filter((id) => !owned.has(id));
}
