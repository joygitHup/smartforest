/** 告警相关类型 — 对齐后端 /api/alerts/ */

export type AlertLevel = 'level_1' | 'level_2' | 'level_3';
export type AlertStatus =
  | 'new'
  | 'acknowledged'
  | 'dispatched'
  | 'processing'
  | 'resolved'
  | 'false_alarm'
  | 'escalated';

export type AlertType =
  | 'fire'
  | 'smoke'
  | 'high_temp'
  | 'device_fault'
  | 'low_battery'
  | 'offline'
  | 'env_threshold';

export interface AlertListItem {
  id: number;
  alert_id: string;
  device: number;
  device_id: string;
  device_name: string;
  alert_type: AlertType | string;
  alert_type_display?: string;
  alert_level: AlertLevel | string;
  alert_level_display?: string;
  status: AlertStatus | string;
  status_display?: string;
  title: string;
  region?: string;
  forest_zone?: string;
  ai_confidence?: number | null;
  occurred_at?: string | null;
  created_at?: string;
}

export interface AlertAction {
  id: number;
  alert: number;
  alert_id?: string;
  alert_title?: string;
  alert_level?: string;
  alert_level_display?: string;
  alert_status?: string;
  alert_status_display?: string;
  alert_type?: string;
  alert_type_display?: string;
  region?: string;
  device_name?: string;
  device_id?: string;
  action_type: string;
  action_type_display?: string;
  operator: string;
  content: string;
  photo_urls?: string[];
  video_url?: string;
  location?: string;
  created_at: string;
}

export interface SpreadPrediction {
  radius_km?: number;
  area_km2?: number;
  direction?: string;
}

export interface WeatherData {
  wind_speed?: number;
  wind_direction?: number | string;
  temperature?: number;
  humidity?: number;
  [key: string]: unknown;
}

export interface ControlStrategy {
  isolation_belt?: Array<{ longitude?: number; latitude?: number }>;
  firefighting_devices?: string[];
  support_routes?: Array<{
    start?: string;
    end?: string;
    distance_km?: number;
  }>;
  [key: string]: unknown;
}

export interface FireTracing {
  id: number;
  alert: number;
  alert_id?: string;
  alert_title?: string;
  alert_level?: string;
  alert_level_display?: string;
  alert_type?: string;
  alert_type_display?: string;
  alert_status?: string;
  alert_status_display?: string;
  region?: string;
  forest_zone?: string;
  device_id?: string;
  device_name?: string;
  occurred_at?: string | null;
  origin_longitude?: number | string | null;
  origin_latitude?: number | string | null;
  origin_confidence?: number | null;
  algorithm?: string;
  input_devices?: string[] | unknown;
  weather_data?: WeatherData | null;
  spread_prediction_1h?: SpreadPrediction | null;
  spread_prediction_3h?: SpreadPrediction | null;
  spread_prediction_6h?: SpreadPrediction | null;
  control_strategy?: ControlStrategy | string | null;
  affected_area_km2?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface FireTracingListParams {
  page?: number;
  page_size?: number;
  search?: string;
  alert?: number;
  alert_level?: string;
  alert_status?: string;
  alert_type?: string;
  region?: string;
  forest_zone?: string;
  algorithm?: string;
  ordering?: string;
}

export interface FireTracingListResponse {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: FireTracing[];
}

export interface FireTracingStatistics {
  total: number;
  active_count: number;
  resolved_count: number;
  by_level: Record<string, number>;
  by_status: Record<string, number>;
  avg_confidence: number;
}

export interface FireTracingReport {
  report_title: string;
  generated_at: string;
  summary: Record<string, unknown>;
  origin: Record<string, unknown>;
  weather: unknown;
  spread: Record<string, unknown>;
  control_strategy: unknown;
  raw: FireTracing;
}

export interface AlertDetail extends AlertListItem {
  description?: string;
  longitude?: number | string | null;
  latitude?: number | string | null;
  ai_category?: string;
  screenshot_url?: string;
  thermal_image_url?: string;
  assigned_to?: string;
  assigned_at?: string | null;
  resolved_at?: string | null;
  resolution_note?: string;
  updated_at?: string;
  actions?: AlertAction[];
  fire_tracing?: FireTracing | null;
  work_orders?: WorkOrder[];
}

export type WorkOrderStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export type WorkOrderPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface WorkOrder {
  id: number;
  work_order_id: string;
  alert: number;
  alert_id?: string;
  alert_title?: string;
  alert_level?: string;
  alert_type?: string;
  alert_status?: string;
  title: string;
  description?: string;
  priority: WorkOrderPriority | string;
  priority_display?: string;
  status: WorkOrderStatus | string;
  status_display?: string;
  assignee?: number | null;
  assignee_name?: string;
  assignee_username?: string;
  creator?: number | null;
  creator_name?: string;
  region?: string;
  forest_zone?: string;
  due_at?: string | null;
  accepted_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  result_note?: string;
  created_at: string;
  updated_at?: string;
}

export interface WorkOrderListResponse {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: WorkOrder[];
}

export interface AlertListResponse {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: AlertListItem[];
}

export interface AlertStatistics {
  period: string;
  total: number;
  by_level: Record<string, number>;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
  by_region: Record<string, number>;
  by_forest_zone: Record<string, number>;
  avg_confidence: number;
  unresolved_count: number;
  unresolved_level_1?: number;
  unresolved_level_2?: number;
  resolved_rate: number;
}

export type PushChannel = 'in_app' | 'sms' | 'voice' | 'dedicated_line' | 'email';

export type RuleApplyScope = 'global' | 'region' | 'device_type' | 'devices';

export interface AlertRuleDeviceBrief {
  id: number;
  device_id: string;
  device_name: string;
  region?: string;
  device_type?: string;
}

export interface AlertRule {
  id: number;
  name: string;
  organization?: number | null;
  organization_name?: string | null;
  alert_type: string;
  alert_type_display?: string;
  alert_level: string;
  alert_level_display?: string;
  confidence_threshold: number;
  temperature_threshold?: number | null;
  humidity_threshold?: number | null;
  push_channels: PushChannel[] | string[];
  response_seconds: number;
  apply_scope?: RuleApplyScope | string;
  apply_scope_display?: string;
  region?: string;
  forest_zone_ref?: number | null;
  forest_zone_ref_name?: string | null;
  device_type?: string;
  device_type_display?: string;
  device_ids?: number[];
  devices_brief?: AlertRuleDeviceBrief[];
  device_count?: number;
  description?: string;
  is_system?: boolean;
  is_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AlertReinforcement {
  id: number;
  alert: number;
  alert_id?: string;
  alert_title?: string;
  requester: string;
  reason: string;
  contact?: string;
  required_people: number;
  status: string;
  status_display?: string;
  handler_note?: string;
  created_at: string;
  updated_at?: string;
}

export interface AlertNavigation {
  alert_id: string;
  latitude: number | null;
  longitude: number | null;
  source: string;
  amap_url: string;
  baidu_url: string;
  google_url: string;
  message: string;
}

export interface AlertListParams {
  page?: number;
  page_size?: number;
  search?: string;
  alert_level?: string;
  status?: string;
  alert_type?: string;
  region?: string;
  forest_zone?: string;
  ordering?: string;
}
