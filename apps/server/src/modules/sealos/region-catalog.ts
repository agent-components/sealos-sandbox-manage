import { z } from "zod";

/** 固定区域目录，运行时不可增删。 */
export const REGION_CATALOG = [
  { id: "gzg", name: "广州" },
  { id: "hzh", name: "杭州" },
  { id: "bja", name: "北京" },
] as const;

export type RegionId = (typeof REGION_CATALOG)[number]["id"];

export const RegionIdSchema = z.enum(["gzg", "hzh", "bja"]);

export const DEFAULT_REGION_ID: RegionId = "gzg";

const nameById = new Map<string, string>(
  REGION_CATALOG.map((r) => [r.id, r.name]),
);

export function isRegionId(value: string): value is RegionId {
  return nameById.has(value);
}

export function regionName(id: string): string {
  return nameById.get(id) ?? id;
}
