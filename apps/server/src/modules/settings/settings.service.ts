import { getSystemSettings, setLogRetentionDays } from '../../lib/settings/store';

export async function getSettings() {
  return { settings: await getSystemSettings() };
}

export async function updateSettings(logRetentionDays: number | null) {
  const settings = await setLogRetentionDays(logRetentionDays);
  return { settings };
}