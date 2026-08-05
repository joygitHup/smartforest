// lib/api/devices.ts
import axios from 'axios';
import { Device, DeviceStats, DeviceCommand, DeviceTelemetry } from '@/types/device';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

// 创建 axios 实例
const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 添加请求拦截器（添加 token）
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器处理错误
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 处理未授权
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// 设备相关 API
export const deviceApi = {
  // 获取设备列表
  getDevices: (params?: {
    search?: string;
    device_type?: string;
    status?: string;
    region?: string;
    page?: number;
    page_size?: number;
  }) => {
    return apiClient.get<{ results: Device[]; count: number }>('/devices/', { params });
  },

  // 获取设备详情
  getDevice: (id: number) => {
    return apiClient.get<Device>(`/devices/${id}/`);
  },

  // 创建设备
  createDevice: (data: Partial<Device>) => {
    return apiClient.post<Device>('/devices/', data);
  },

  // 更新设备
  updateDevice: (id: number, data: Partial<Device>) => {
    return apiClient.patch<Device>(`/devices/${id}/`, data);
  },

  // 删除设备
  deleteDevice: (id: number, force?: boolean) => {
    const url = force ? `/devices/${id}/?force=true` : `/devices/${id}/`;
    return apiClient.delete(url);
  },

  // 获取设备统计
  getStatistics: () => {
    return apiClient.get<DeviceStats>('/devices/statistics/');
  },

  // 获取设备遥测数据
  getTelemetry: (id: number, hours?: number, limit?: number) => {
    return apiClient.get<DeviceTelemetry[]>(`/devices/${id}/telemetry/`, {
      params: { hours, limit },
    });
  },

  // 获取设备指令历史
  getCommands: (id: number, limit?: number) => {
    return apiClient.get<DeviceCommand[]>(`/devices/${id}/commands/`, {
      params: { limit },
    });
  },

  // 更新设备状态
  updateStatus: (id: number, status: string) => {
    return apiClient.post(`/devices/${id}/update_status/`, { status });
  },

  // 云台控制
  ptzControl: (id: number, direction: string, speed?: number) => {
    return apiClient.post(`/devices/${id}/ptz_control/`, { direction, speed });
  },

  // 远程重启
  restartDevice: (id: number) => {
    return apiClient.post(`/devices/${id}/restart/`);
  },

  // 获取最新遥测（所有设备）
  getLatestTelemetry: () => {
    return apiClient.get<DeviceTelemetry[]>('/telemetry/latest/');
  },
};

// 指令相关 API
export const commandApi = {
  // 创建指令
  createCommand: (data: { device: number; command_type: string; command_params?: Record<string, any> }) => {
    return apiClient.post<DeviceCommand>('/commands/', data);
  },

  // 重试指令
  retryCommand: (id: number) => {
    return apiClient.post(`/commands/${id}/retry/`);
  },

  // 取消指令
  cancelCommand: (id: number) => {
    return apiClient.post(`/commands/${id}/cancel/`);
  },
};