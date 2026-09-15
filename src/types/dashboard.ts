/** 指挥中心类型 — 对齐 /api/dashboard/overview/ */

export interface ForestZoneFilterItem {
  id: number | null;
  name: string;
  code?: string;
  organization_id?: number | null;
  organization_name?: string | null;
  region?: string;
  regions?: string[];
}

export interface DashboardMapDevice {
  id: number;
  device_id: string;
  device_name: string;
  device_type: string;
  device_type_display?: string;
  status: string;
  status_display?: string;
  longitude: number;
  latitude: number;
  region?: string;
  forest_zone?: string;
  signal_strength?: number;
  battery_level?: number | null;
  last_online_time?: string | null;
  pan_angle?: number | null;
  tilt_angle?: number | null;
}

export interface DashboardRecentAlert {
  id: number;
  alert_id: string;
  device: number;
  device_id: string;
  device_name: string;
  alert_type: string;
  alert_type_display?: string;
  alert_level: string;
  alert_level_display?: string;
  status: string;
  status_display?: string;
  title: string;
  region?: string;
  forest_zone?: string;
  occurred_at?: string | null;
  created_at?: string;
  longitude?: number | null;
  latitude?: number | null;
}

export interface DashboardFireHighlight {
  id: number;
  alert: number;
  alert_id?: string;
  alert_title?: string;
  alert_level?: string;
  origin_longitude?: number | string | null;
  origin_latitude?: number | string | null;
  origin_confidence?: number | null;
  algorithm?: string;
  spread_prediction_6h?: { area_km2?: number; radius_km?: number } | null;
  created_at?: string;
}

export interface DashboardOverview {
  generated_at: string;
  filters: {
    region: string | null;
    forest_zone: string | null;
    regions: string[];
    forest_zones: string[];
    forest_zone_items?: ForestZoneFilterItem[];
    regions_by_forest_zone?: Record<string, string[]>;
  };
  devices: {
    total: number;
    online: number;
    offline: number;
    alarm: number;
    maintenance: number;
  };
  alerts: {
    today: number;
    yesterday: number;
    vs_yesterday: number;
    unresolved: number;
    false_alarm_rate: number;
    recent: DashboardRecentAlert[];
  };
  environment: {
    avg_temperature: number | null;
    avg_humidity: number | null;
    avg_wind_speed: number | null;
  };
  carbon: {
    value: number;
    unit: string;
    source: string;
  };
  fire_tracing: {
    active_count: number;
    total: number;
    highlights: DashboardFireHighlight[];
  };
  map_devices: DashboardMapDevice[];
}
