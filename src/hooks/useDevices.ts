// src/hooks/useDevices.ts
import { useState, useEffect, useCallback } from 'react';
import { deviceApi } from '@/lib/api/devices';
import { Device } from '@/types/device';
import { usePagination } from '@/components/ui/pagination';

interface UseDevicesOptions {
  search?: string;
  device_type?: string;
  status?: string;
  region?: string;
  autoLoad?: boolean;
  pageSize?: number;
}

export function useDevices(options: UseDevicesOptions = {}) {
  const { autoLoad = true, pageSize = 10 } = options;
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const pagination = usePagination(pageSize);
  const { current, onPageChange, onPageSizeChange } = pagination;

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await deviceApi.getDevices({
        search: options.search,
        device_type: options.device_type,
        status: options.status,
        region: options.region,
        page: current,
        page_size: pageSize,
      });
      // 适配不同的响应格式
      if (response.data && Array.isArray(response.data.results)) {
        setDevices(response.data.results);
        setTotal(response.data.count || response.data.results.length);
      } else if (Array.isArray(response.data)) {
        setDevices(response.data);
        setTotal(response.data.length);
      } else {
        setDevices([]);
        setTotal(0);
      }
    } catch (err: any) {
      setError(err.message || '加载设备列表失败');
      setDevices([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [current, pageSize, options.search, options.device_type, options.status, options.region]);

  useEffect(() => {
    if (autoLoad) {
      loadDevices();
    }
  }, [loadDevices, autoLoad]);

  return {
    devices,
    loading,
    error,
    total,
    current,
    pageSize,
    onPageChange,
    onPageSizeChange,
    refresh: loadDevices,
  };
}

export function useDevice(id: number | null) {
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDevice = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await deviceApi.getDevice(id);
      setDevice(response.data);
    } catch (err: any) {
      setError(err.message || '加载设备详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const deleteDevice = useCallback(async (force?: boolean) => {
    if (!id) return;
    try {
      await deviceApi.deleteDevice(id, force);
      setDevice(null);
      return true;
    } catch (err: any) {
      setError(err.message || '删除设备失败');
      throw err;
    }
  }, [id]);

  const updateStatus = useCallback(async (status: string) => {
    if (!id) return;
    try {
      await deviceApi.updateStatus(id, status);
      await loadDevice();
      return true;
    } catch (err: any) {
      setError(err.message || '更新状态失败');
      throw err;
    }
  }, [id, loadDevice]);

  const ptzControl = useCallback(async (direction: string, speed?: number) => {
    if (!id) return;
    try {
      const response = await deviceApi.ptzControl(id, direction, speed);
      return response.data;
    } catch (err: any) {
      setError(err.message || '云台控制失败');
      throw err;
    }
  }, [id]);

  const restart = useCallback(async () => {
    if (!id) return;
    try {
      const response = await deviceApi.restartDevice(id);
      return response.data;
    } catch (err: any) {
      setError(err.message || '重启失败');
      throw err;
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      loadDevice();
    } else {
      setDevice(null);
    }
  }, [id, loadDevice]);

  return {
    device,
    loading,
    error,
    loadDevice,
    deleteDevice,
    updateStatus,
    ptzControl,
    restart,
  };
}