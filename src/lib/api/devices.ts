// 设备管理 API — 对应后端 /api/devices/devices/

import { apiUrl, BACKEND_ORIGIN } from '@/lib/api/config';
import { authFetch, getAccessToken } from '@/lib/auth';

export interface Device {
  id: number;
  device_id: string;
  device_name: string;
  device_type: string;
  device_type_display?: string;
  status: string;
  status_display?: string;
  longitude?: number | string | null;
  latitude?: number | string | null;
  altitude?: number | string | null;
  region?: string;
  forest_zone?: string;
  forest_zone_ref?: number | null;
  forest_zone_ref_name?: string | null;
  organization?: number | null;
  organization_name?: string | null;
  firmware_version?: string;
  hardware_version?: string;
  manufacturer?: string;
  install_date?: string | null;
  last_maintenance?: string | null;
  communication_type?: string;
  communication_type_display?: string;
  signal_strength?: number;
  battery_level?: number | null;
  pan_angle?: number | string | null;
  tilt_angle?: number | string | null;
  last_online_time?: string | null;
  last_heartbeat?: string | null;
  created_at?: string;
  updated_at?: string;
  is_online?: boolean;
}

export interface CreateDeviceData {
  device_id: string;
  device_name: string;
  device_type: string;
  status?: string;
  longitude?: number;
  latitude?: number;
  altitude?: number;
  region?: string;
  forest_zone?: string;
  forest_zone_ref?: number | null;
  firmware_version?: string;
  hardware_version?: string;
  manufacturer?: string;
  install_date?: string;
  communication_type?: string;
  signal_strength?: number;
  battery_level?: number;
}

export interface DeviceListResponse {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: Device[];
}

const DEVICES_BASE = '/api/devices/devices';

async function parseError(response: Response, fallback: string): Promise<string> {
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.detail === 'string') return record.detail;
  if (typeof record.error === 'string') return record.error;
  return fallback;
}

/**
 * 获取设备列表 GET /api/devices/devices/
 */
export async function getDevices(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  device_type?: string;
  status?: string;
  /** 片区 */
  region?: string;
  /** 林区名称 */
  forest_zone?: string;
}): Promise<DeviceListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
  if (params?.search) searchParams.set('search', params.search);
  if (params?.device_type) searchParams.set('device_type', params.device_type);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.forest_zone) searchParams.set('forest_zone', params.forest_zone);
  if (params?.region) searchParams.set('region', params.region);

  const query = searchParams.toString();
  const url = apiUrl(query ? `${DEVICES_BASE}/?${query}` : `${DEVICES_BASE}/`);

  const response = await authFetch(url, { method: 'GET' });

  if (!response.ok) {
    throw new Error(await parseError(response, '获取设备列表失败'));
  }

  return response.json() as Promise<DeviceListResponse>;
}

/**
 * 创建设备 POST /api/devices/devices/
 */
export async function createDevice(data: CreateDeviceData): Promise<Device> {
  const response = await authFetch(apiUrl(`${DEVICES_BASE}/`), {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, '创建设备失败'));
  }

  return response.json() as Promise<Device>;
}

/**
 * 获取设备详情 GET /api/devices/devices/:id/
 */
export async function getDevice(id: number): Promise<Device> {
  const response = await authFetch(apiUrl(`${DEVICES_BASE}/${id}/`), {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(await parseError(response, '获取设备详情失败'));
  }

  return response.json() as Promise<Device>;
}

/**
 * 更新设备 PATCH /api/devices/devices/:id/
 */
export async function updateDevice(
  id: number,
  data: Partial<CreateDeviceData>
): Promise<Device> {
  const response = await authFetch(apiUrl(`${DEVICES_BASE}/${id}/`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, '更新设备失败'));
  }

  return response.json() as Promise<Device>;
}

/**
 * 删除设备 DELETE /api/devices/devices/:id/
 * force=true 时强制删除关联遥测/指令
 */
export async function deleteDevice(id: number, force = false): Promise<void> {
  const url = apiUrl(
    force ? `${DEVICES_BASE}/${id}/?force=true` : `${DEVICES_BASE}/${id}/`
  );
  const response = await authFetch(url, { method: 'DELETE' });

  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if (response.status === 409 && typeof record.warning === 'string') {
        const err = new Error(record.warning) as Error & { conflict?: boolean };
        err.conflict = true;
        throw err;
      }
      if (typeof record.error === 'string') throw new Error(record.error);
      if (typeof record.detail === 'string') throw new Error(record.detail);
    }
    throw new Error('删除设备失败');
  }
}

/** POST /api/devices/devices/:id/ptz_control/ */
export async function ptzControl(
  id: number,
  direction: string,
  speed = 5
): Promise<{ status: string; message: string; correlation_id?: string }> {
  const response = await authFetch(apiUrl(`${DEVICES_BASE}/${id}/ptz_control/`), {
    method: 'POST',
    body: JSON.stringify({ direction, speed }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '云台控制失败'));
  }
  return response.json() as Promise<{ status: string; message: string; correlation_id?: string }>;
}

/** POST /api/devices/devices/:id/ptz_goto/ */
export async function ptzGoto(
  id: number,
  panAngle: number,
  tiltAngle: number,
  speed = 5
): Promise<{ status: string; message: string }> {
  const response = await authFetch(apiUrl(`${DEVICES_BASE}/${id}/ptz_goto/`), {
    method: 'POST',
    body: JSON.stringify({ pan_angle: panAngle, tilt_angle: tiltAngle, speed }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '云台指向失败'));
  }
  return response.json() as Promise<{ status: string; message: string }>;
}

/** POST /api/devices/devices/:id/restart/ */
export async function restartDevice(
  id: number
): Promise<{ status: string; message: string }> {
  const response = await authFetch(apiUrl(`${DEVICES_BASE}/${id}/restart/`), {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '远程重启失败'));
  }
  return response.json() as Promise<{ status: string; message: string }>;
}

export interface DeviceCommandItem {
  id: number;
  device?: number;
  device_id?: string;
  device_name?: string;
  command_type: string;
  command_params?: Record<string, unknown>;
  correlation_id?: string;
  status: string;
  status_display?: string;
  result?: Record<string, unknown> | null;
  error_message?: string;
  operator?: number | null;
  operator_name?: string | null;
  sent_at?: string | null;
  executed_at?: string | null;
  created_at?: string;
}

/** GET /api/devices/devices/:id/commands/ */
export async function getDeviceCommands(
  id: number,
  params?: { limit?: number; status?: string }
): Promise<{ count: number; results: DeviceCommandItem[] }> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.status) sp.set('status', params.status);
  const q = sp.toString();
  const response = await authFetch(
    apiUrl(q ? `${DEVICES_BASE}/${id}/commands/?${q}` : `${DEVICES_BASE}/${id}/commands/`)
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '获取指令历史失败'));
  }
  const data: unknown = await response.json();
  if (Array.isArray(data)) {
    return { count: data.length, results: data as DeviceCommandItem[] };
  }
  return data as { count: number; results: DeviceCommandItem[] };
}

export interface DevicePreset {
  id: number;
  preset_id: number;
  name: string;
  pan_angle: number | string;
  tilt_angle: number | string;
  created_at?: string;
  updated_at?: string;
}

export async function getDevicePresets(
  id: number
): Promise<{ count: number; results: DevicePreset[] }> {
  const response = await authFetch(apiUrl(`${DEVICES_BASE}/${id}/presets/`));
  if (!response.ok) {
    throw new Error(await parseError(response, '获取预置位失败'));
  }
  return response.json() as Promise<{ count: number; results: DevicePreset[] }>;
}

export async function saveDevicePreset(
  id: number,
  data: {
    preset_id: number;
    name?: string;
    pan_angle?: number;
    tilt_angle?: number;
    save_current?: boolean;
  }
): Promise<DevicePreset> {
  const response = await authFetch(apiUrl(`${DEVICES_BASE}/${id}/presets/`), {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '保存预置位失败'));
  }
  return response.json() as Promise<DevicePreset>;
}

export async function gotoDevicePreset(
  id: number,
  presetId: number,
  speed = 5
): Promise<{ status: string; message: string }> {
  const response = await authFetch(
    apiUrl(`${DEVICES_BASE}/${id}/presets/${presetId}/goto/`),
    {
      method: 'POST',
      body: JSON.stringify({ speed }),
    }
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '跳转预置位失败'));
  }
  return response.json() as Promise<{ status: string; message: string }>;
}

export async function deleteDevicePreset(
  id: number,
  presetId: number
): Promise<{ deleted: number; message: string }> {
  const response = await authFetch(apiUrl(`${DEVICES_BASE}/${id}/presets/`), {
    method: 'DELETE',
    body: JSON.stringify({ preset_id: presetId }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '删除预置位失败'));
  }
  return response.json() as Promise<{ deleted: number; message: string }>;
}

/** POST /api/devices/devices/:id/aim_alert/ */
export async function aimDeviceAtAlert(
  devicePk: number,
  alertPk: number
): Promise<{ status: string; message: string; pan_angle?: number }> {
  const response = await authFetch(apiUrl(`${DEVICES_BASE}/${devicePk}/aim_alert/`), {
    method: 'POST',
    body: JSON.stringify({ alert_pk: alertPk }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '告警对准失败'));
  }
  return response.json() as Promise<{ status: string; message: string; pan_angle?: number }>;
}

export interface CommandAuditReport {
  hours: number;
  total: number;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
  recent: DeviceCommandItem[];
}

/** GET /api/devices/devices/command_audit/ */
export async function getCommandAudit(params?: {
  hours?: number;
  limit?: number;
  device_id?: string;
}): Promise<CommandAuditReport> {
  const sp = new URLSearchParams();
  if (params?.hours) sp.set('hours', String(params.hours));
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.device_id) sp.set('device_id', params.device_id);
  const q = sp.toString();
  const response = await authFetch(
    apiUrl(q ? `${DEVICES_BASE}/command_audit/?${q}` : `${DEVICES_BASE}/command_audit/`)
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '获取操作审计失败'));
  }
  return response.json() as Promise<CommandAuditReport>;
}

export function getDeviceWsUrl(deviceId: string): string | null {
  const token = getAccessToken();
  if (!token) return null;
  const wsOrigin = BACKEND_ORIGIN.replace(/^http/, 'ws');
  return `${wsOrigin}/ws/device/${encodeURIComponent(deviceId)}/?token=${encodeURIComponent(token)}`;
}


/** GET /api/devices/devices/:id/effective_rules/ */
export async function getDeviceEffectiveRules(id: number): Promise<{
  device_id: string;
  device_name: string;
  count: number;
  results: Array<{
    id: number;
    name: string;
    alert_type: string;
    alert_type_display?: string;
    alert_level: string;
    alert_level_display?: string;
    apply_scope?: string;
    apply_scope_display?: string;
    region?: string;
    device_type?: string;
    is_enabled: boolean;
  }>;
}> {
  const response = await authFetch(apiUrl(`${DEVICES_BASE}/${id}/effective_rules/`));
  if (!response.ok) {
    throw new Error(await parseError(response, '获取设备生效规则失败'));
  }
  return response.json();
}

export interface BatchDeleteResult {
  deleted_count: number;
  total: number;
  errors: string[];
}

export interface BatchStatusResult {
  updated_count: number;
  total: number;
  status: string;
  message: string;
}

export interface BatchRestartResult {
  sent_count: number;
  total: number;
  errors: string[];
  message: string;
}

/** POST /api/devices/devices/batch_delete/ */
export async function batchDeleteDevices(
  deviceIds: number[],
  force = false
): Promise<BatchDeleteResult> {
  const response = await authFetch(apiUrl(`${DEVICES_BASE}/batch_delete/`), {
    method: 'POST',
    body: JSON.stringify({ device_ids: deviceIds, force }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '批量删除失败'));
  }
  return response.json() as Promise<BatchDeleteResult>;
}

/** POST /api/devices/devices/batch_update_status/ */
export async function batchUpdateDeviceStatus(
  deviceIds: number[],
  status: string
): Promise<BatchStatusResult> {
  const response = await authFetch(apiUrl(`${DEVICES_BASE}/batch_update_status/`), {
    method: 'POST',
    body: JSON.stringify({ device_ids: deviceIds, status }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '批量更新状态失败'));
  }
  return response.json() as Promise<BatchStatusResult>;
}

/** POST /api/devices/devices/batch_restart/ */
export async function batchRestartDevices(
  deviceIds: number[]
): Promise<BatchRestartResult> {
  const response = await authFetch(apiUrl(`${DEVICES_BASE}/batch_restart/`), {
    method: 'POST',
    body: JSON.stringify({ device_ids: deviceIds }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '批量重启失败'));
  }
  return response.json() as Promise<BatchRestartResult>;
}

/** 兼容旧 hook 的 deviceApi 对象 */
export const deviceApi = {
  getDevices: async (params?: Parameters<typeof getDevices>[0]) => {
    const data = await getDevices(params);
    return { data };
  },
  getDevice: async (id: number) => {
    const data = await getDevice(id);
    return { data };
  },
  createDevice,
  updateDevice,
  deleteDevice: async (id: number, force?: boolean) => {
    await deleteDevice(id, force);
  },
  updateStatus: async (id: number, status: string) => {
    const data = await updateDevice(id, { status });
    return { data };
  },
  ptzControl: async (id: number, direction: string, speed?: number) => {
    const data = await ptzControl(id, direction, speed);
    return { data };
  },
  restartDevice: async (id: number) => {
    const data = await restartDevice(id);
    return { data };
  },
};
