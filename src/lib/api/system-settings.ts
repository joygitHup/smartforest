// 系统设置 API — 平台名称（全平台）+ 组织级配置

import { apiUrl } from '@/lib/api/config';
import { authFetch } from '@/lib/auth';

export interface PlatformSettingsResponse {
  platform_name: string;
  can_edit: boolean;
  updated_at?: string | null;
}

export interface OrganizationSettingsResponse {
  organization_id: number;
  refresh_interval: string;
  default_map_layer: string;
  coordinate_system: string;
  video_capture: string;
  sensor_interval: string;
  video_codec: string;
  offline_cache_days: string;
  resume_upload: boolean;
  notify_in_app: boolean;
  notify_app_push: boolean;
  notify_sms: boolean;
  notify_voice_call: boolean;
  notify_forestry_line: boolean;
  duty_mode_label: string;
  data_retention: string;
  video_storage: string;
  can_edit: boolean;
  updated_at?: string | null;
}

async function parseError(response: Response, fallback: string): Promise<string> {
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.error === 'string') return record.error;
  if (typeof record.detail === 'string') return record.detail;
  for (const value of Object.values(record)) {
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    if (typeof value === 'string') return value;
  }
  return fallback;
}

export async function getPlatformSettings(): Promise<PlatformSettingsResponse> {
  const response = await authFetch(apiUrl('/api/users/platform-settings/'));
  if (!response.ok) {
    throw new Error(await parseError(response, '获取平台设置失败'));
  }
  return response.json() as Promise<PlatformSettingsResponse>;
}

export async function updatePlatformSettings(payload: {
  platform_name: string;
}): Promise<PlatformSettingsResponse> {
  const response = await authFetch(apiUrl('/api/users/platform-settings/'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '保存平台名称失败'));
  }
  return response.json() as Promise<PlatformSettingsResponse>;
}

export async function getOrganizationSettings(
  organizationId?: number
): Promise<OrganizationSettingsResponse> {
  const sp = new URLSearchParams();
  if (organizationId != null) sp.set('organization_id', String(organizationId));
  const q = sp.toString();
  const response = await authFetch(
    apiUrl(`/api/users/organization-settings/${q ? `?${q}` : ''}`)
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '获取组织设置失败'));
  }
  return response.json() as Promise<OrganizationSettingsResponse>;
}

export async function updateOrganizationSettings(
  payload: Partial<Omit<OrganizationSettingsResponse, 'organization_id' | 'can_edit' | 'updated_at'>> & {
    organization_id?: number;
  }
): Promise<OrganizationSettingsResponse> {
  const response = await authFetch(apiUrl('/api/users/organization-settings/'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '保存组织设置失败'));
  }
  return response.json() as Promise<OrganizationSettingsResponse>;
}
