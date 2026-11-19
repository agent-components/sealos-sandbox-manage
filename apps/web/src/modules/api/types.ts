import type { Sandbox } from '../sandbox/schema';
import type { ResourceSpec } from '../sealos/resources';
import type { Template } from '../template/schema';

export type SandboxUser = {
  username: string;
  displayName: string;
  role: 'ADMIN' | 'USER';
};

export type RegionPublic = {
  id: 'gzg' | 'hzh' | 'bja';
  name: string;
  isDefault: boolean;
};

export type BillingPrices = {
  cpu: number;
  memory: number;
  storage: number;
  port: number;
};

export type RegionAdmin = {
  id: 'gzg' | 'hzh' | 'bja';
  name: string;
  launchpadBase: string | null;
  configured: boolean;
  enabled: boolean;
  isDefault: boolean;
  prices: BillingPrices;
  updatedAt: string | null;
};

export type CreateSandboxBody = {
  templateId: string;
  regionId?: 'gzg' | 'hzh' | 'bja';
  name?: string;
  cpu?: number;
  memoryGi?: number;
  diskGi?: number;
  env?: { name: string; value: string }[];
  tags?: string[];
  autoShutdown?: boolean;
  idleMinutes?: number;
};

export type UpdateSandboxBody = Partial<ResourceSpec> & {
  env?: { name: string; value: string }[];
  tags?: string[];
  autoShutdown?: boolean;
  idleMinutes?: number;
  applyTemplate?: boolean;
};

export type PageResult<T> = {
  list: T[];
  total: number;
};

export type BillingUsage = {
  cpuCoreHours: number;
  memoryGiHours: number;
  storageGiHours: number;
  portHours: number;
  cpuCost: number;
  memoryCost: number;
  storageCost: number;
  portCost: number;
  totalCost: number;
};

export type SandboxBillingRow = BillingUsage & {
  sandboxId: string;
  regionId: 'gzg' | 'hzh' | 'bja';
  regionName: string;
};

export type RegionBillingGroup = BillingUsage & {
  regionId: 'gzg' | 'hzh' | 'bja';
  regionName: string;
  sandboxes: SandboxBillingRow[];
};

export type BillingReport = {
  from: string;
  to: string;
  total: BillingUsage;
  regions: RegionBillingGroup[];
};

export type CreateTemplateBody = Omit<
  Template,
  'id' | 'createdAt' | 'updatedAt' | 'owner' | 'sandboxCount'
> & { id?: string };

export type UpdateTemplateBody = Partial<Omit<CreateTemplateBody, 'id'>>;

export type SystemSettings = {
  logRetentionDays: number | null;
  updatedAt: string | null;
};

export type EphemeralDiskReport = {
  limitBytes: number;
  usedBytes: number;
  writableBytes: number | null;
  logBytes: number | null;
  usageSource: 'kubelet' | 'files';
  directories: { path: string; bytes: number }[];
  checkedAt: string;
  detail: string | null;
};

export type CallLogRow = {
  id: string;
  username?: string;
  channel?: 'mcp' | 'rest';
  operation: string;
  method: string;
  path: string;
  arguments: Record<string, unknown>;
  status: number;
  ok: boolean;
  resultKey: string | null;
  resultError: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  createdAt: string;
};

export type { Sandbox, Template };