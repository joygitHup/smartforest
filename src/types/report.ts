/** 报表中心类型 — 对齐 /api/reports/ */

export interface DailyReport {
  id: number;
  report_date: string;
  total_devices: number;
  online_devices: number;
  online_rate: number;
  total_alerts: number;
  resolved_alerts: number;
  resolution_rate: number;
  avg_response_time: number;
  false_alarm_count: number;
  false_alarm_rate: number;
  avg_temperature?: number | null;
  max_temperature?: number | null;
  avg_humidity?: number | null;
  avg_wind_speed?: number | null;
  carbon_sequestration: number;
  created_at?: string;
  updated_at?: string;
}

export interface DailyReportSummary {
  date_range: { start: string; end: string };
  total_days: number;
  avg_online_rate: number;
  avg_resolution_rate: number;
  total_alerts: number;
  total_false_alarms: number;
  avg_response_time: number;
  total_carbon: number;
  trend: {
    online_rate: number[];
    resolution_rate: number[];
    total_alerts: number[];
    dates: string[];
  };
}

export interface AlertAnalysis {
  period: string;
  report_date: string | null;
  source?: string;
  total: number;
  open_count?: number;
  resolved_count?: number;
  false_alarm_count?: number;
  closed_count?: number;
  resolution_rate?: number;
  false_alarm_rate?: number;
  avg_response_seconds?: number;
  by_level: Array<{
    level: string;
    label: string;
    total: number;
    resolved: number;
    open?: number;
    false_alarm?: number;
    resolution_rate: number;
    avg_response_seconds: number;
  }>;
  by_type: Array<{
    alert_type: string;
    label: string;
    count: number;
    pct: number;
  }>;
  by_status?: Array<{
    status: string;
    label: string;
    count: number;
    pct: number;
  }>;
  by_zone: Array<{
    forest_zone: string;
    count: number;
    level: string;
  }>;
  by_region?: Array<{
    region: string;
    count: number;
    level: string;
  }>;
  top_devices?: Array<{
    device_id: string;
    device_name: string;
    count: number;
  }>;
  hourly: number[];
  daily_trend?: Array<{
    date: string;
    count: number;
  }>;
}

export interface DeviceStatistic {
  id: number;
  device: number;
  device_id: string;
  device_name: string;
  device_type: string;
  region?: string;
  forest_zone?: string;
  stat_date: string;
  uptime_hours: number;
  availability_rate: number;
  alert_count: number;
  fault_count: number;
  data_completeness: number;
}

export interface DeviceStatisticsSummary {
  period: string;
  total_records: number;
  avg_availability: number;
  avg_uptime_hours: number;
  avg_data_completeness: number;
  total_alerts: number;
  total_faults: number;
  fault_device_count: number;
  type_distribution: Array<{
    device_type: string;
    label: string;
    count: number;
    online: number;
  }>;
  fault_devices: Array<{
    device__device_id: string;
    device__device_name: string;
    faults: number;
  }>;
  top_devices: Array<{
    device__device_id: string;
    device__device_name: string;
    device__device_type: string;
    total_alerts: number;
    avg_availability: number;
  }>;
}

export interface EnvironmentalData {
  id: number;
  region: string;
  stat_date: string;
  stat_hour?: number | null;
  avg_temperature?: number | null;
  max_temperature?: number | null;
  min_temperature?: number | null;
  avg_humidity?: number | null;
  max_humidity?: number | null;
  min_humidity?: number | null;
  avg_wind_speed?: number | null;
  max_wind_speed?: number | null;
  avg_light_intensity?: number | null;
  avg_soil_moisture?: number | null;
  avg_fuel_moisture?: number | null;
  created_at?: string;
}

export interface EnvironmentalDailySummary {
  stat_date: string;
  region: string;
  summary: {
    avg_temperature?: number | null;
    max_temperature?: number | null;
    min_temperature?: number | null;
    avg_humidity?: number | null;
    max_humidity?: number | null;
    min_humidity?: number | null;
    avg_wind_speed?: number | null;
    max_wind_speed?: number | null;
    avg_light_intensity?: number | null;
    avg_soil_moisture?: number | null;
    avg_fuel_moisture?: number | null;
  };
  hourly: Array<{
    stat_hour: number;
    avg_temperature?: number | null;
    avg_humidity?: number | null;
    avg_wind_speed?: number | null;
    avg_soil_moisture?: number | null;
    avg_light_intensity?: number | null;
  }>;
  by_region?: Array<{
    region: string;
    avg_temperature?: number | null;
    max_temperature?: number | null;
    min_temperature?: number | null;
    avg_humidity?: number | null;
    avg_wind_speed?: number | null;
    avg_soil_moisture?: number | null;
    avg_fuel_moisture?: number | null;
    avg_light_intensity?: number | null;
  }>;
  record_count: number;
  source?: string;
}

export interface GenerateResult {
  status: string;
  report_date?: string;
  stat_date?: string;
  mode?: string;
  task_id?: string | null;
  message?: string;
  result?: unknown;
  error?: string;
  hint?: string;
}

export interface Paginated<T> {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}
