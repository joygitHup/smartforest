// app/devices/page.tsx
'use client';

import { useState, useMemo } from 'react';
import { useDevices, useDevice } from '@/hooks/useDevices';
import Pagination, { usePagination } from '@/components/ui/pagination';
import { Device } from '@/types/device';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { toast } from 'sonner';


const typeLabels: Record<string, string> = {
  dual_camera: '双目云台',
  env_sensor: '环境传感器',
  ai_gateway: '边缘网关',
  drone: '巡检无人机',
};

const statusLabels: Record<string, { text: string; color: string }> = {
  online: { text: '在线', color: 'text-[#10b981]' },
  offline: { text: '离线', color: 'text-[#8b9bb4]' },
  alarm: { text: '告警', color: 'text-[#ef4444]' },
  maintenance: { text: '维护中', color: 'text-[#f59e0b]' },
};

export default function DevicesPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);

  // 使用自定义 Hook 获取设备列表
  const {
    devices,
    loading,
    error,
    total,
    current,
    pageSize,
    onPageChange,
    onPageSizeChange,
    refresh,
  } = useDevices({
    search,
    device_type: typeFilter !== 'all' ? typeFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    pageSize: 10,
  });

   // ✅ 检查是否已登录
  useEffect(() => {
    if (!authApi.isAuthenticated()) {
      router.replace('/login');
    }
  }, [router]);

  // 如果未登录，不渲染页面
  if (!authApi.isAuthenticated()) {
    return null;
  }

  // 使用自定义 Hook 获取设备详情
  const {
    device: selectedDevice,
    loading: detailLoading,
    deleteDevice,
    updateStatus,
    ptzControl,
    restart,
  } = useDevice(selectedDeviceId);

  // 过滤（API 已经做了过滤，但前端也可以保留）
  const filtered = devices;

  const handleDelete = async (id: number, force?: boolean) => {
    if (!confirm('确定要删除该设备吗？')) return;
    try {
      await deleteDevice(force);
      toast.success('设备删除成功');
      refresh();
      setSelectedDeviceId(null);
    } catch (err: any) {
      toast.error(err.message || '删除设备失败');
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await updateStatus(status);
      toast.success('设备状态已更新');
      refresh();
    } catch (err: any) {
      toast.error(err.message || '更新状态失败');
    }
  };

  const handlePtzControl = async (direction: string, speed?: number) => {
    if (!selectedDeviceId) return;
    try {
      await ptzControl(direction, speed);
      toast.success(`云台控制指令已发送: ${direction}`);
    } catch (err: any) {
      toast.error(err.message || '云台控制失败');
    }
  };

  const handleRestart = async () => {
    if (!selectedDeviceId) return;
    try {
      await restart();
      toast.success('重启指令已发送');
    } catch (err: any) {
      toast.error(err.message || '重启失败');
    }
  };

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#ef4444] text-sm">{error}</p>
          <button
            onClick={refresh}
            className="mt-4 px-4 py-2 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb]"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#e8f1ff]">设备管理</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.href = '/devices/create'}
            className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors"
          >
            + 添加设备
          </button>
          <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">
            批量操作
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="搜索设备名称或ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6] w-64"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
        >
          <option value="all">全部类型</option>
          <option value="dual_camera">双目云台</option>
          <option value="env_sensor">环境传感器</option>
          <option value="ai_gateway">边缘网关</option>
          <option value="drone">巡检无人机</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
        >
          <option value="all">全部状态</option>
          <option value="online">在线</option>
          <option value="offline">离线</option>
          <option value="alarm">告警</option>
          <option value="maintenance">维护中</option>
        </select>
        <span className="text-xs text-[#8b9bb4] ml-auto">
          共 <span className="text-[#e8f1ff] font-mono">{total}</span> 台设备
          {loading && <span className="ml-2 text-[#3b82f6]">加载中...</span>}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full">
            <thead className="bg-[#0f1e35] sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">设备ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">设备名称</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">类型</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">状态</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">信号</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">电量</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">所属林区</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">最后在线</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-[#8b9bb4] text-sm">
                    加载中...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-[#8b9bb4] text-sm">
                    暂无设备数据
                  </td>
                </tr>
              ) : (
                filtered.map((device) => (
                  <tr key={device.id} className="border-t border-[#1e3a5f]/50 hover:bg-[#1a2d4a] transition-colors">
                    <td className="px-4 py-3 text-xs text-[#e8f1ff] font-mono">{device.device_id}</td>
                    <td className="px-4 py-3 text-xs text-[#e8f1ff]">{device.device_name}</td>
                    <td className="px-4 py-3 text-xs text-[#8b9bb4]">{typeLabels[device.device_type] || device.device_type}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${statusLabels[device.status]?.color || 'text-[#8b9bb4]'}`}>
                        {device.status === 'alarm' && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#ef4444] mr-1 animate-pulse" />
                        )}
                        {statusLabels[device.status]?.text || device.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }, (_, i) => (
                          <div
                            key={i}
                            className={`w-1 h-3 rounded-sm ${i < device.signal_strength ? 'bg-[#10b981]' : 'bg-[#1e3a5f]'}`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-[#0f1e35] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              (device.battery_level || 0) > 50 ? 'bg-[#10b981]' :
                              (device.battery_level || 0) > 20 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]'
                            }`}
                            style={{ width: `${device.battery_level || 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#8b9bb4] font-mono">{device.battery_level || 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#8b9bb4]">{device.forest_zone || '-'}</td>
                    <td className="px-4 py-3 text-xs text-[#8b9bb4] font-mono">
                      {device.last_online_time ? new Date(device.last_online_time).toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedDeviceId(device.id)}
                        className="text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#1e3a5f]">
          <Pagination
            current={current}
            pageSize={pageSize}
            total={total}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </div>
      </div>

      {/* Device Detail Modal */}
      {selectedDevice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setSelectedDeviceId(null)}
        >
          <div
            className="bg-[#152238] border border-[#1e3a5f] rounded-lg w-[640px] max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e3a5f]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[#e8f1ff]">设备详情</span>
                <span className="text-xs text-[#8b9bb4] font-mono">[{selectedDevice.device_id}]</span>
              </div>
              <button
                onClick={() => setSelectedDeviceId(null)}
                className="text-[#8b9bb4] hover:text-[#e8f1ff]"
              >
                ✕
              </button>
            </div>
            {detailLoading ? (
              <div className="p-6 text-center text-[#8b9bb4]">加载中...</div>
            ) : (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                    <div className="text-[10px] text-[#8b9bb4] mb-2">基本信息</div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">设备名称</span>
                        <span className="text-[#e8f1ff]">{selectedDevice.device_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">设备类型</span>
                        <span className="text-[#e8f1ff]">{typeLabels[selectedDevice.device_type]}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">所属林区</span>
                        <span className="text-[#e8f1ff]">{selectedDevice.forest_zone || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">GPS坐标</span>
                        <span className="text-[#e8f1ff] font-mono">
                          {selectedDevice.latitude}°, {selectedDevice.longitude}°
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                    <div className="text-[10px] text-[#8b9bb4] mb-2">运行状态</div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">在线状态</span>
                        <span className={statusLabels[selectedDevice.status]?.color}>
                          {statusLabels[selectedDevice.status]?.text || selectedDevice.status}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">信号强度</span>
                        <span className="text-[#e8f1ff] font-mono">{selectedDevice.signal_strength}/5</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">电池电量</span>
                        <span className="text-[#e8f1ff] font-mono">{selectedDevice.battery_level || 0}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">最后在线</span>
                        <span className="text-[#e8f1ff] font-mono">
                          {selectedDevice.last_online_time ? new Date(selectedDevice.last_online_time).toLocaleString() : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedDevice.device_type === 'dual_camera' && (
                  <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                    <div className="text-[10px] text-[#8b9bb4] mb-2">云台参数</div>
                    <div className="grid grid-cols-4 gap-4 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">水平角</span>
                        <span className="text-[#e8f1ff] font-mono">{selectedDevice.pan_angle || 0}°</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">垂直角</span>
                        <span className="text-[#e8f1ff] font-mono">{selectedDevice.tilt_angle || 0}°</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">固件版本</span>
                        <span className="text-[#e8f1ff]">{selectedDevice.firmware_version || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">厂商</span>
                        <span className="text-[#e8f1ff]">{selectedDevice.manufacturer || '-'}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2 flex-wrap">
                  <button
                    onClick={() => handlePtzControl('up')}
                    className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors"
                  >
                    云台控制
                  </button>
                  <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">
                    录像回放
                  </button>
                  <button
                    onClick={handleRestart}
                    className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors"
                  >
                    远程重启
                  </button>
                  <button
                    onClick={() => handleDelete(selectedDevice.id)}
                    className="px-3 py-1.5 text-xs border border-[#ef4444]/30 text-[#ef4444] rounded hover:bg-[#ef4444]/10 transition-colors"
                  >
                    删除设备
                  </button>
                  <select
                    onChange={(e) => handleStatusChange(selectedDevice.id, e.target.value)}
                    value={selectedDevice.status}
                    className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] ml-auto"
                  >
                    <option value="online">在线</option>
                    <option value="offline">离线</option>
                    <option value="alarm">告警</option>
                    <option value="maintenance">维护中</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}