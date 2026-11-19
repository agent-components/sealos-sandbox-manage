import type { Sandbox } from "./schema";
import { isRegionId, regionName } from "../sealos/region-catalog";
import type { RegionCredentials } from "../sealos/regions";
import { createLaunchpadClient } from "../sealos/launchpad";

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
