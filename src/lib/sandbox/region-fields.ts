import type { Sandbox } from "@/lib/sandbox/schema";
import { isRegionId, regionName } from "@/lib/sealos/region-catalog";
import type { RegionCredentials } from "@/lib/sealos/regions";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";

export function attachRegion(sandbox: Sandbox, regionId: string): Sandbox {
  if (!isRegionId(regionId)) return sandbox;
  return {
    ...sandbox,
    regionId,
    regionName: regionName(regionId),
  };
}

export function launchpadClientFor(region: RegionCredentials) {
  return createLaunchpadClient({
    kubeconfig: region.kubeconfig,
    baseUrl: region.launchpadBase,
  });
}
