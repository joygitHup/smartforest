'use client';

import { useState } from 'react';
import { devices, type Device } from '@/lib/mock-data';
import Pagination, { usePagination } from '@/components/ui/pagination';

const typeLabels: Record<string, string> = {
  cloud_platform: '双目云台',
  sensor: '环境传感器',
  gateway: '边缘网关',
  drone: '巡检无人机',
};

const statusLabels: Record<string, { text: string; color: string }> = {
  online: { text: '在线', color: 'text-[#10b981]' },
  offline: { text: '离线', color: 'text-[#8b9bb4]' },
  alarm: { text: '告警', color: 'text-[#ef4444]' },
};

export default function DevicesPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const { current, pageSize, onPageChange, onPageSizeChange } = usePagination(10);

  const filtered = devices.filter((d) => {
    if (search && !d.name.includes(search) && !d.id.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== 'all' && d.type !== typeFilter) return false;
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    return true;
  });

  const paged = filtered.slice((current - 1) * pageSize, current * pageSize);

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#e8f1ff]">设备管理</h1>
        <div className="flex items-center gap-3">
          <button className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors">
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
          <option value="cloud_platform">双目云台</option>
          <option value="sensor">环境传感器</option>
          <option value="gateway">边缘网关</option>
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
        </select>
        <span className="text-xs text-[#8b9bb4] ml-auto">
          共 <span className="text-[#e8f1ff] font-mono">{filtered.length}</span> 台设备
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
              {paged.map((device) => (
                <tr key={device.id} className="border-t border-[#1e3a5f]/50 hover:bg-[#1a2d4a] transition-colors">
                  <td className="px-4 py-3 text-xs text-[#e8f1ff] font-mono">{device.id}</td>
                  <td className="px-4 py-3 text-xs text-[#e8f1ff]">{device.name}</td>
                  <td className="px-4 py-3 text-xs text-[#8b9bb4]">{typeLabels[device.type]}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${statusLabels[device.status]?.color || 'text-[#8b9bb4]'}`}>
                      {device.status === 'alarm' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#ef4444] mr-1 animate-pulse" />}
                      {statusLabels[device.status]?.text || device.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }, (_, i) => (
                        <div
                          key={i}
                          className={`w-1 h-3 rounded-sm ${i < device.signal ? 'bg-[#10b981]' : 'bg-[#1e3a5f]'}`}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-[#0f1e35] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            device.battery > 50 ? 'bg-[#10b981]' : device.battery > 20 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]'
                          }`}
                          style={{ width: `${device.battery}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#8b9bb4] font-mono">{device.battery}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#8b9bb4]">{device.area}</td>
                  <td className="px-4 py-3 text-xs text-[#8b9bb4] font-mono">{device.lastOnline}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedDevice(device)}
                      className="text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
                    >
                      详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#1e3a5f]">
          <Pagination
            current={current}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </div>
      </div>

      {/* Device Detail Modal */}
      {selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedDevice(null)}>
          <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg w-[640px] max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e3a5f]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[#e8f1ff]">设备详情</span>
                <span className="text-xs text-[#8b9bb4] font-mono">[{selectedDevice.id}]</span>
              </div>
              <button onClick={() => setSelectedDevice(null)} className="text-[#8b9bb4] hover:text-[#e8f1ff]">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                  <div className="text-[10px] text-[#8b9bb4] mb-2">基本信息</div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">设备名称</span><span className="text-[#e8f1ff]">{selectedDevice.name}</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">设备类型</span><span className="text-[#e8f1ff]">{typeLabels[selectedDevice.type]}</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">所属林区</span><span className="text-[#e8f1ff]">{selectedDevice.area}</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">GPS坐标</span><span className="text-[#e8f1ff] font-mono">{selectedDevice.lat}°, {selectedDevice.lng}°</span></div>
                  </div>
                </div>
                <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                  <div className="text-[10px] text-[#8b9bb4] mb-2">运行状态</div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">在线状态</span><span className={statusLabels[selectedDevice.status]?.color}>{statusLabels[selectedDevice.status]?.text}</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">信号强度</span><span className="text-[#e8f1ff] font-mono">{selectedDevice.signal}/5</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">电池电量</span><span className="text-[#e8f1ff] font-mono">{selectedDevice.battery}%</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">最后在线</span><span className="text-[#e8f1ff] font-mono">{selectedDevice.lastOnline}</span></div>
                  </div>
                </div>
              </div>
              {selectedDevice.type === 'cloud_platform' && (
                <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                  <div className="text-[10px] text-[#8b9bb4] mb-2">云台参数</div>
                  <div className="grid grid-cols-4 gap-4 text-xs">
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">水平角</span><span className="text-[#e8f1ff] font-mono">{selectedDevice.panAngle}°</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">垂直角</span><span className="text-[#e8f1ff] font-mono">{selectedDevice.tiltAngle}°</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">画面状态</span><span className="text-[#e8f1ff]">{selectedDevice.videoStatus}</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">温度</span><span className="text-[#e8f1ff] font-mono">{selectedDevice.temperature}℃</span></div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 pt-2">
                <button className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors">云台控制</button>
                <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">录像回放</button>
                <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">远程重启</button>
                <button className="px-3 py-1.5 text-xs border border-[#ef4444]/30 text-[#ef4444] rounded hover:bg-[#ef4444]/10 transition-colors">删除设备</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
