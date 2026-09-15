// 指挥中心 API — /api/dashboard/

import { apiUrl, BACKEND_ORIGIN } from '@/lib/api/config';
import { authFetch, getAccessToken } from '@/lib/auth';
import type { DashboardOverview, ForestZoneFilterItem } from '@/types/dashboard';

async function parseError(response: Response, fallback: string): Promise<string> {
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.detail === 'string') return record.detail;
  if (typeof record.error === 'string') return record.error;
  if (typeof record.message === 'string') return record.message;
  return fallback;
}

/** GET /api/dashboard/overview/ */
export async function getDashboardOverview(params?: {
  region?: string;
  forest_zone?: string;
}): Promise<DashboardOverview> {
  const sp = new URLSearchParams();
  if (params?.region) sp.set('region', params.region);
  if (params?.forest_zone) sp.set('forest_zone', params.forest_zone);
  const q = sp.toString();
  const response = await authFetch(
    apiUrl(q ? `/api/dashboard/overview/?${q}` : '/api/dashboard/overview/')
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '获取指挥中心数据失败'));
  }
  return response.json() as Promise<DashboardOverview>;
}

/** GET /api/dashboard/regions/ */
export async function getDashboardRegions(): Promise<{
  regions: string[];
  forest_zones: string[];
  forest_zone_items?: ForestZoneFilterItem[];
  regions_by_forest_zone?: Record<string, string[]>;
}> {
  const response = await authFetch(apiUrl('/api/dashboard/regions/'));
  if (!response.ok) {
    throw new Error(await parseError(response, '获取区域列表失败'));
  }
  return response.json() as Promise<{
    regions: string[];
    forest_zones: string[];
    forest_zone_items?: ForestZoneFilterItem[];
    regions_by_forest_zone?: Record<string, string[]>;
  }>;
}

/** WebSocket URL for dashboard live feed */
export function getDashboardWsUrl(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  const wsOrigin = BACKEND_ORIGIN.replace(/^http/, 'ws');
  return `${wsOrigin}/ws/dashboard/?token=${encodeURIComponent(token)}`;
}
