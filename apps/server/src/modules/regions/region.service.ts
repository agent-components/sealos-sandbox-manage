import { RegionIdSchema } from '../../lib/sealos/region-catalog';
import {
  clearRegionConfig,
  listRegionsAdmin,
  listRegionsPublic,
  setDefaultRegion,
  upsertRegionConfig,
} from '../../lib/sealos/regions';
export type UpsertRegionBody = {
  launchpadBase: string;
  kubeconfig?: string | null;
  prices?: {
    cpu: number;
    memory: number;
    storage: number;
    port: number;
  } | null;
};

export async function listPublicRegions() {
  const list = await listRegionsPublic();
  return { list };
}

export async function listAdminRegions() {
  const list = await listRegionsAdmin();
  return { list };
}

export async function upsertRegion(regionId: string, body: UpsertRegionBody) {
  const id = RegionIdSchema.parse(regionId);
  const region = await upsertRegionConfig(id, {
    launchpadBase: body.launchpadBase,
    kubeconfig: body.kubeconfig,
    prices: body.prices,
  });
  return { region };
}

export async function clearRegion(regionId: string) {
  const id = RegionIdSchema.parse(regionId);
  const region = await clearRegionConfig(id);
  return { region };
}

export async function setDefault(regionId: string) {
  const id = RegionIdSchema.parse(regionId);
  const region = await setDefaultRegion(id);
  return { region };
}