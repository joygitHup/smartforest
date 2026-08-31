// types/device.ts
// src/types/device.ts
export interface Device {
  id: number;
  device_id: string;
  device_name: string;
  device_type: 'dual_camera' | 'env_sensor' | 'ai_gateway' | 'drone';
  device_type_display: string;
  status: 'online' | 'offline' | 'alarm' | 'maintenance';
  status_display: string;
  longitude: string | null;
  latitude: string | null;
  altitude: string | null;
  region: string;
  forest_zone: string;
  firmware_version: string;
  hardware_version: string;
  manufacturer: string;
  install_date: string | null;
  last_maintenance: string | null;
  communication_type: '4g' | 'lora' | 'wifi' | 'ethernet';
  communication_type_display?: string;
  signal_strength: number;
  battery_level: number | null;
  pan_angle: string | null;
  tilt_angle: string | null;
  last_online_time: string | null;
  last_heartbeat: string | null;
  created_at: string;
  updated_at: string;
  latest_telemetry?: DeviceTelemetry | null;
}

export interface DeviceTelemetry {
  id: number;
  device: number;
  device_name: string;
  device_id: string;
  timestamp: string;
  temperature: number | null;
  humidity: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  light_intensity: number | null;
  soil_moisture_10cm: number | null;
  soil_moisture_30cm: number | null;
  soil_moisture_60cm: number | null;
  fuel_moisture: number | null;
  video_status: 'normal' | 'blurry' | 'obstructed' | 'no_signal' | null;
  thermal_max_temp: number | null;
  thermal_min_temp: number | null;
  thermal_avg_temp: number | null;
  thermal_hotspot_x: number | null;
  thermal_hotspot_y: number | null;
  created_at: string;
}

export interface DeviceCommand {
  id: number;
  device: number;
  device_name: string;
  device_id: string;
  command_type: string;
  command_params: Record<string, any>;
  status: 'pending' | 'sent' | 'delivered' | 'executed' | 'failed' | 'timeout';
  status_display: string;
  result: Record<string, any> | null;
  error_message: string;
  sent_at: string | null;
  delivered_at: string | null;
  executed_at: string | null;
  created_at: string;
}

export interface DeviceStats {
  total: number;
  online: number;
  offline: number;
  alarm: number;
  by_type: Record<string, number>;
  by_region: Record<string, number>;
}

export interface CreateDeviceData {
  device_id: string;
  device_name: string;
  device_type: string;
  status?: string;
  longitude?: number | string;
  latitude?: number | string;
  altitude?: number | string;
  region?: string;
  forest_zone?: string;
  firmware_version?: string;
  hardware_version?: string;
  manufacturer?: string;
  install_date?: string;
  last_maintenance?: string;
  communication_type?: string;
  signal_strength?: number;
  battery_level?: number;
  pan_angle?: number | string;
  tilt_angle?: number | string;
}