export interface Device {
  id: string;
  name: string;
  type: 'cloud_platform' | 'sensor' | 'gateway' | 'drone';
  status: 'online' | 'offline' | 'alarm';
  signal: number;
  battery: number;
  lat: number;
  lng: number;
  area: string;
  lastOnline: string;
  panAngle?: number;
  tiltAngle?: number;
  videoStatus?: string;
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  windDirection?: number;
}

export interface Alert {
  id: string;
  level: 1 | 2 | 3;
  type: string;
  deviceId: string;
  deviceName: string;
  area: string;
  lat: number;
  lng: number;
  confidence: number;
  time: string;
  status: 'pending' | 'dispatched' | 'processing' | 'resolved' | 'false_alarm';
  description: string;
  screenshot?: string;
}

export interface EnvData {
  time: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  fuelMoisture: number;
  lightIntensity: number;
}

export const devices: Device[] = [
  { id: 'ZHL-001', name: '白桦林1号杆', type: 'cloud_platform', status: 'online', signal: 5, battery: 92, lat: 42.35, lng: 118.23, area: '白桦林保护区', lastOnline: '2026-08-02 14:23', panAngle: 45.2, tiltAngle: -12.5, videoStatus: '正常', temperature: 32, humidity: 45 },
  { id: 'ZHL-002', name: '红松保护区2号', type: 'cloud_platform', status: 'alarm', signal: 4, battery: 78, lat: 42.38, lng: 117.91, area: '红松保护区', lastOnline: '2026-08-02 14:22', panAngle: 120.8, tiltAngle: -8.3, videoStatus: '正常', temperature: 35, humidity: 38 },
  { id: 'ZHL-003', name: '樟子松3号杆', type: 'cloud_platform', status: 'online', signal: 4, battery: 87, lat: 42.41, lng: 118.05, area: '樟子松林区', lastOnline: '2026-08-02 14:23', panAngle: -30.1, tiltAngle: 5.7, videoStatus: '正常', temperature: 30, humidity: 52 },
  { id: 'ZHL-004', name: '落叶松4号杆', type: 'cloud_platform', status: 'online', signal: 3, battery: 65, lat: 42.33, lng: 118.15, area: '落叶松林区', lastOnline: '2026-08-02 14:20', panAngle: 90.0, tiltAngle: -15.0, videoStatus: '模糊', temperature: 33, humidity: 41 },
  { id: 'ENV-001', name: '环境传感器A1', type: 'sensor', status: 'online', signal: 5, battery: 95, lat: 42.36, lng: 118.10, area: '白桦林保护区', lastOnline: '2026-08-02 14:23', temperature: 28.5, humidity: 62, windSpeed: 3.2, windDirection: 225 },
  { id: 'ENV-002', name: '环境传感器A2', type: 'sensor', status: 'online', signal: 4, battery: 88, lat: 42.39, lng: 117.95, area: '红松保护区', lastOnline: '2026-08-02 14:23', temperature: 31.2, humidity: 55, windSpeed: 4.8, windDirection: 180 },
  { id: 'ENV-003', name: '环境传感器B1', type: 'sensor', status: 'offline', signal: 0, battery: 12, lat: 42.42, lng: 118.20, area: '樟子松林区', lastOnline: '2026-08-01 22:15', temperature: 0, humidity: 0, windSpeed: 0, windDirection: 0 },
  { id: 'GW-001', name: '边缘网关G1', type: 'gateway', status: 'online', signal: 5, battery: 100, lat: 42.37, lng: 118.08, area: '中心区域', lastOnline: '2026-08-02 14:23' },
  { id: 'GW-002', name: '边缘网关G2', type: 'gateway', status: 'online', signal: 4, battery: 100, lat: 42.40, lng: 118.00, area: '西部区域', lastOnline: '2026-08-02 14:23' },
  { id: 'DRN-001', name: '巡检无人机D1', type: 'drone', status: 'online', signal: 3, battery: 72, lat: 42.38, lng: 118.12, area: '空中巡检', lastOnline: '2026-08-02 14:23' },
  { id: 'ZHL-005', name: '云杉林5号杆', type: 'cloud_platform', status: 'online', signal: 5, battery: 96, lat: 42.34, lng: 118.25, area: '云杉林区', lastOnline: '2026-08-02 14:23', panAngle: 180.0, tiltAngle: 0.0, videoStatus: '正常', temperature: 29, humidity: 58 },
  { id: 'ZHL-006', name: '针阔混交林6号', type: 'cloud_platform', status: 'online', signal: 4, battery: 81, lat: 42.43, lng: 118.08, area: '针阔混交林区', lastOnline: '2026-08-02 14:22', panAngle: -90.5, tiltAngle: 10.2, videoStatus: '正常', temperature: 31, humidity: 48 },
  { id: 'ENV-004', name: '环境传感器C1', type: 'sensor', status: 'online', signal: 5, battery: 91, lat: 42.35, lng: 118.18, area: '云杉林区', lastOnline: '2026-08-02 14:23', temperature: 27.8, humidity: 65, windSpeed: 2.1, windDirection: 315 },
  { id: 'ZHL-007', name: '防火瞭望塔7号', type: 'cloud_platform', status: 'online', signal: 5, battery: 100, lat: 42.44, lng: 117.98, area: '北部瞭望区', lastOnline: '2026-08-02 14:23', panAngle: 0.0, tiltAngle: -20.0, videoStatus: '正常', temperature: 26, humidity: 70 },
  { id: 'ENV-005', name: '环境传感器D1', type: 'sensor', status: 'online', signal: 3, battery: 45, lat: 42.32, lng: 118.22, area: '南部边界', lastOnline: '2026-08-02 14:21', temperature: 34.1, humidity: 35, windSpeed: 5.6, windDirection: 90 },
];

export const alerts: Alert[] = [
  { id: 'ALT-20260802-001', level: 1, type: '火情', deviceId: 'ZHL-002', deviceName: '红松保护区2号', area: '红松保护区', lat: 42.38, lng: 117.91, confidence: 96.5, time: '2026-08-02 14:21', status: 'dispatched', description: '多设备交叉确认：检测到明火，热成像温度异常升高', screenshot: 'fire_001' },
  { id: 'ALT-20260802-002', level: 2, type: '高温', deviceId: 'ENV-005', deviceName: '环境传感器D1', area: '南部边界', lat: 42.32, lng: 118.22, confidence: 88.2, time: '2026-08-02 13:58', status: 'dispatched', description: '环境温度持续升高至34.1°C，可燃物含水率降至35%', screenshot: 'heat_001' },
  { id: 'ALT-20260802-003', level: 3, type: '烟雾', deviceId: 'ZHL-004', deviceName: '落叶松4号杆', area: '落叶松林区', lat: 42.33, lng: 118.15, confidence: 72.3, time: '2026-08-02 13:45', status: 'resolved', description: '疑似烟雾，AI识别置信度较低，经确认为云雾误报', screenshot: 'smoke_001' },
  { id: 'ALT-20260802-004', level: 2, type: '高温', deviceId: 'ENV-002', deviceName: '环境传感器A2', area: '红松保护区', lat: 42.39, lng: 117.95, confidence: 85.7, time: '2026-08-02 13:30', status: 'processing', description: '红松保护区环境温度异常，湿度持续下降', screenshot: 'heat_002' },
  { id: 'ALT-20260802-005', level: 3, type: '设备故障', deviceId: 'ENV-003', deviceName: '环境传感器B1', area: '樟子松林区', lat: 42.42, lng: 118.20, confidence: 0, time: '2026-08-02 12:45', status: 'pending', description: '设备离线超过16小时，电量低于15%，疑似设备故障' },
  { id: 'ALT-20260802-006', level: 3, type: '烟雾', deviceId: 'ZHL-001', deviceName: '白桦林1号杆', area: '白桦林保护区', lat: 42.35, lng: 118.23, confidence: 68.5, time: '2026-08-02 12:30', status: 'false_alarm', description: '云雾误识别为烟雾，已标记为误报样本', screenshot: 'fog_001' },
  { id: 'ALT-20260802-007', level: 2, type: '低电量', deviceId: 'ENV-005', deviceName: '环境传感器D1', area: '南部边界', lat: 42.32, lng: 118.22, confidence: 0, time: '2026-08-02 11:20', status: 'resolved', description: '设备电量降至45%，已安排巡检更换电池' },
  { id: 'ALT-20260802-008', level: 1, type: '火情', deviceId: 'ZHL-006', deviceName: '针阔混交林6号', area: '针阔混交林区', lat: 42.43, lng: 118.08, confidence: 91.2, time: '2026-08-02 10:15', status: 'resolved', description: '双光谱确认火情，护林员已到达现场扑灭', screenshot: 'fire_002' },
  { id: 'ALT-20260801-009', level: 3, type: '信号弱', deviceId: 'ZHL-004', deviceName: '落叶松4号杆', area: '落叶松林区', lat: 42.33, lng: 118.15, confidence: 0, time: '2026-08-01 22:30', status: 'resolved', description: '信号强度降至3级，可能受地形遮挡影响' },
  { id: 'ALT-20260801-010', level: 2, type: '高温', deviceId: 'ENV-001', deviceName: '环境传感器A1', area: '白桦林保护区', lat: 42.36, lng: 118.10, confidence: 82.1, time: '2026-08-01 15:40', status: 'resolved', description: '午后温度峰值达33°C，已恢复正常' },
  { id: 'ALT-20260801-011', level: 3, type: '视频异常', deviceId: 'ZHL-004', deviceName: '落叶松4号杆', area: '落叶松林区', lat: 42.33, lng: 118.15, confidence: 0, time: '2026-08-01 14:20', status: 'resolved', description: '可见光画面模糊，疑似镜头污染，已远程清理' },
  { id: 'ALT-20260801-012', level: 1, type: '火情', deviceId: 'ZHL-003', deviceName: '樟子松3号杆', area: '樟子松林区', lat: 42.41, lng: 118.05, confidence: 94.8, time: '2026-08-01 09:55', status: 'resolved', description: 'AI识别烟雾+热成像确认，已快速处置', screenshot: 'fire_003' },
];

export const envHistory: EnvData[] = Array.from({ length: 24 }, (_, i) => ({
  time: `${String(i).padStart(2, '0')}:00`,
  temperature: 22 + Math.sin(i / 24 * Math.PI * 2) * 8 + Math.random() * 2,
  humidity: 55 + Math.cos(i / 24 * Math.PI * 2) * 15 + Math.random() * 3,
  windSpeed: 2 + Math.abs(Math.sin(i / 12 * Math.PI)) * 4 + Math.random(),
  windDirection: (180 + Math.sin(i / 24 * Math.PI * 2) * 90 + 360) % 360,
  fuelMoisture: 45 + Math.cos(i / 24 * Math.PI * 2) * 10 + Math.random() * 2,
  lightIntensity: Math.max(0, Math.sin((i - 6) / 12 * Math.PI) * 120000 + Math.random() * 5000),
}));

export const dashboardStats = {
  onlineDevices: 1247,
  totalDevices: 1380,
  todayAlerts: 23,
  falseAlarmRate: 3.2,
  carbonSink: 12.4,
  avgTemperature: 30.8,
  avgHumidity: 52,
  windLevel: 3,
};
