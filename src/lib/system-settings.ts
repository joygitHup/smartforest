/** 系统设置：默认值 + 本地缓存；真实数据以服务端平台/组织设置为准 */

export interface GeneralSettingsData {
  platformName: string;
  refreshInterval: string;
  defaultMapLayer: string;
  coordinateSystem: string;
}

export interface DeviceSettingsData {
  videoCapture: string;
  sensorInterval: string;
  videoCodec: string;
  offlineCacheDays: string;
  resumeUpload: boolean;
}

export interface NotificationSettingsData {
  inApp: boolean;
  appPush: boolean;
  sms: boolean;
  voiceCall: boolean;
  forestryLine: boolean;
  dutyMode: string;
}

export interface ManagementSettingsData {
  dataRetention: string;
  videoStorage: string;
}

export interface SystemSettingsStore {
  general: GeneralSettingsData;
  device: DeviceSettingsData;
  notification: NotificationSettingsData;
  management: ManagementSettingsData;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsStore = {
  general: {
    platformName: '林智森林智能监控平台',
    refreshInterval: '10秒',
    defaultMapLayer: '标准地图',
    coordinateSystem: 'WGS-84',
  },
  device: {
    videoCapture: '连续采集',
    sensorInterval: '5分钟',
    videoCodec: 'H.265 (自适应)',
    offlineCacheDays: '≥7天',
    resumeUpload: true,
  },
  notification: {
    inApp: true,
    appPush: true,
    sms: true,
    voiceCall: true,
    forestryLine: true,
    dutyMode: '三班倒',
  },
  management: {
    dataRetention: '90天',
    videoStorage: '告警片段保留30天',
  },
};

/** 将「10秒」「5分钟」等文案解析为毫秒；失败回退 defaultMs */
export function parseIntervalToMs(label: string | undefined | null, defaultMs: number): number {
  const text = (label || '').trim();
  if (!text) return defaultMs;
  const presets: Record<string, number> = {
    '5秒': 5_000,
    '10秒': 10_000,
    '30秒': 30_000,
    '60秒': 60_000,
    '1分钟': 60_000,
    '5分钟': 300_000,
    '10分钟': 600_000,
  };
  if (presets[text] != null) return presets[text];
  const m = text.match(/^(\d+(?:\.\d+)?)\s*(秒|分钟|分|小时|时)?$/);
  if (!m) return defaultMs;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return defaultMs;
  const unit = m[2] || '秒';
  if (unit === '分钟' || unit === '分') return Math.round(value * 60_000);
  if (unit === '小时' || unit === '时') return Math.round(value * 3_600_000);
  return Math.round(value * 1_000);
}

/** 默认地图图层文案 → 态势图层枚举 */
export function mapLayerFromSetting(
  label: string | undefined | null
): 'standard' | 'thermal' | 'fire' {
  const text = (label || '').trim();
  if (text.includes('热力')) return 'thermal';
  if (text.includes('火险') || text.includes('火情')) return 'fire';
  return 'standard';
}

const STORAGE_KEY = 'smartforest_system_settings';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeGeneral(raw: unknown): GeneralSettingsData {
  const base = DEFAULT_SYSTEM_SETTINGS.general;
  if (!isRecord(raw)) return { ...base };
  return {
    platformName:
      typeof raw.platformName === 'string' && raw.platformName.trim()
        ? raw.platformName.trim()
        : base.platformName,
    refreshInterval:
      typeof raw.refreshInterval === 'string' ? raw.refreshInterval : base.refreshInterval,
    defaultMapLayer:
      typeof raw.defaultMapLayer === 'string' ? raw.defaultMapLayer : base.defaultMapLayer,
    coordinateSystem:
      typeof raw.coordinateSystem === 'string' ? raw.coordinateSystem : base.coordinateSystem,
  };
}

function mergeDevice(raw: unknown): DeviceSettingsData {
  const base = DEFAULT_SYSTEM_SETTINGS.device;
  if (!isRecord(raw)) return { ...base };
  return {
    videoCapture: typeof raw.videoCapture === 'string' ? raw.videoCapture : base.videoCapture,
    sensorInterval: typeof raw.sensorInterval === 'string' ? raw.sensorInterval : base.sensorInterval,
    videoCodec: typeof raw.videoCodec === 'string' ? raw.videoCodec : base.videoCodec,
    offlineCacheDays:
      typeof raw.offlineCacheDays === 'string' ? raw.offlineCacheDays : base.offlineCacheDays,
    resumeUpload: typeof raw.resumeUpload === 'boolean' ? raw.resumeUpload : base.resumeUpload,
  };
}

function mergeNotification(raw: unknown): NotificationSettingsData {
  const base = DEFAULT_SYSTEM_SETTINGS.notification;
  if (!isRecord(raw)) return { ...base };
  return {
    inApp: typeof raw.inApp === 'boolean' ? raw.inApp : base.inApp,
    appPush: typeof raw.appPush === 'boolean' ? raw.appPush : base.appPush,
    sms: typeof raw.sms === 'boolean' ? raw.sms : base.sms,
    voiceCall: typeof raw.voiceCall === 'boolean' ? raw.voiceCall : base.voiceCall,
    forestryLine: typeof raw.forestryLine === 'boolean' ? raw.forestryLine : base.forestryLine,
    dutyMode: typeof raw.dutyMode === 'string' ? raw.dutyMode : base.dutyMode,
  };
}

function mergeManagement(raw: unknown): ManagementSettingsData {
  const base = DEFAULT_SYSTEM_SETTINGS.management;
  if (!isRecord(raw)) return { ...base };
  return {
    dataRetention: typeof raw.dataRetention === 'string' ? raw.dataRetention : base.dataRetention,
    videoStorage: typeof raw.videoStorage === 'string' ? raw.videoStorage : base.videoStorage,
  };
}

function cloneDefaults(): SystemSettingsStore {
  return {
    general: { ...DEFAULT_SYSTEM_SETTINGS.general },
    device: { ...DEFAULT_SYSTEM_SETTINGS.device },
    notification: { ...DEFAULT_SYSTEM_SETTINGS.notification },
    management: { ...DEFAULT_SYSTEM_SETTINGS.management },
  };
}

export function loadSystemSettings(): SystemSettingsStore {
  if (typeof window === 'undefined') {
    return cloneDefaults();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return cloneDefaults();
    return {
      general: mergeGeneral(parsed.general),
      device: mergeDevice(parsed.device),
      notification: mergeNotification(parsed.notification),
      management: mergeManagement(parsed.management),
    };
  } catch {
    return cloneDefaults();
  }
}

export function saveSystemSettings(settings: SystemSettingsStore): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function applyPlatformName(
  store: SystemSettingsStore,
  platformName: string
): SystemSettingsStore {
  const name = platformName.trim() || DEFAULT_SYSTEM_SETTINGS.general.platformName;
  return {
    ...store,
    general: { ...store.general, platformName: name },
  };
}

export function applyOrganizationSettingsPayload(
  store: SystemSettingsStore,
  org: {
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
  }
): SystemSettingsStore {
  return {
    general: {
      ...store.general,
      refreshInterval: org.refresh_interval,
      defaultMapLayer: org.default_map_layer,
      coordinateSystem: org.coordinate_system,
    },
    device: {
      videoCapture: org.video_capture,
      sensorInterval: org.sensor_interval,
      videoCodec: org.video_codec,
      offlineCacheDays: org.offline_cache_days,
      resumeUpload: org.resume_upload,
    },
    notification: {
      inApp: org.notify_in_app,
      appPush: org.notify_app_push,
      sms: org.notify_sms,
      voiceCall: org.notify_voice_call,
      forestryLine: org.notify_forestry_line,
      dutyMode: org.duty_mode_label,
    },
    management: {
      dataRetention: org.data_retention,
      videoStorage: org.video_storage,
    },
  };
}

export function toOrganizationSettingsPatch(store: SystemSettingsStore): {
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
} {
  return {
    refresh_interval: store.general.refreshInterval,
    default_map_layer: store.general.defaultMapLayer,
    coordinate_system: store.general.coordinateSystem,
    video_capture: store.device.videoCapture,
    sensor_interval: store.device.sensorInterval,
    video_codec: store.device.videoCodec,
    offline_cache_days: store.device.offlineCacheDays,
    resume_upload: store.device.resumeUpload,
    notify_in_app: store.notification.inApp,
    notify_app_push: store.notification.appPush,
    notify_sms: store.notification.sms,
    notify_voice_call: store.notification.voiceCall,
    notify_forestry_line: store.notification.forestryLine,
    duty_mode_label: store.notification.dutyMode,
    data_retention: store.management.dataRetention,
    video_storage: store.management.videoStorage,
  };
}
