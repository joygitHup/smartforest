'use client';

import { useState } from 'react';
import { devices, alerts, dashboardStats, type Device } from '@/lib/mock-data';

function StatCard({ label, value, unit, trend, color }: { label: string; value: string | number; unit?: string; trend?: string; color: string }) {
  return (
    <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4 hover:border-[#3b82f6]/50 transition-colors">
      <div className="text-xs text-[#8b9bb4] mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold font-mono ${color}`}>{value}</span>
        {unit && <span className="text-xs text-[#8b9bb4]">{unit}</span>}
      </div>
      {trend && <div className="text-[10px] text-[#8b9bb4] mt-1">{trend}</div>}
    </div>
  );
}

function AlertBadge({ level }: { level: number }) {
  const configs: Record<number, { color: string; text: string; pulse: boolean }> = {
    1: { color: 'bg-[#ef4444]', text: '一级', pulse: true },
    2: { color: 'bg-[#f59e0b]', text: '二级', pulse: false },
    3: { color: 'bg-[#3b82f6]', text: '三级', pulse: false },
  };
  const config = configs[level] || { color: 'bg-gray-500', text: '未知', pulse: false };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-white ${config.color} ${config.pulse ? 'animate-alert-pulse' : ''}`}>
      {config.pulse && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
      {config.text}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { color: string; text: string }> = {
    pending: { color: 'text-[#f59e0b]', text: '待处理' },
    dispatched: { color: 'text-[#3b82f6]', text: '已派单' },
    processing: { color: 'text-[#06b6d4]', text: '处置中' },
    resolved: { color: 'text-[#10b981]', text: '已处置' },
    false_alarm: { color: 'text-[#8b9bb4]', text: '误报' },
  };
  const config = configs[status] || { color: 'text-[#8b9bb4]', text: status };

  return <span className={`text-xs font-mono ${config.color}`}>{config.text}</span>;
}

function DeviceMarker({ device, onClick }: { device: Device; onClick: (d: Device) => void }) {
  const color = device.status === 'alarm' ? '#ef4444' : device.status === 'offline' ? '#8b9bb4' : '#10b981';
  return (
    <button
      onClick={() => onClick(device)}
      className="absolute group"
      style={{ left: `${((device.lng - 117.8) / 0.6) * 100}%`, top: `${((42.5 - device.lat) / 0.3) * 100}%` }}
    >
      <div className="relative">
        {device.status === 'alarm' && (
          <div className="absolute inset-0 w-4 h-4 rounded-full bg-[#ef4444]/30 animate-marker-pulse" />
        )}
        <div className="w-3 h-3 rounded-full border-2 border-[#0a1628]" style={{ backgroundColor: color }} />
      </div>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-[#152238] border border-[#1e3a5f] rounded text-[10px] text-[#e8f1ff] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {device.name}
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [mapLayer, setMapLayer] = useState<'standard' | 'thermal' | 'fire'>('standard');

  const recentAlerts = alerts.slice(0, 10);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Stats Row */}
      <div className="grid grid-cols-6 gap-3">
        <StatCard label="在线设备" value={dashboardStats.onlineDevices} unit="台" trend={`共 ${dashboardStats.totalDevices} 台`} color="text-[#10b981]" />
        <StatCard label="当日告警" value={dashboardStats.todayAlerts} unit="次" trend="较昨日 +3" color="text-[#f59e0b]" />
        <StatCard label="误报率" value={dashboardStats.falseAlarmRate} unit="%" trend="持续优化中" color="text-[#06b6d4]" />
        <StatCard label="碳汇值" value={dashboardStats.carbonSink} unit="万t" trend="年度累计" color="text-[#10b981]" />
        <StatCard label="平均温度" value={dashboardStats.avgTemperature} unit="℃" trend="全区均值" color="text-[#f59e0b]" />
        <StatCard label="平均湿度" value={dashboardStats.avgHumidity} unit="%RH" trend="全区均值" color="text-[#3b82f6]" />
      </div>

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-[1fr_320px] gap-4 min-h-0">
        {/* Map Area */}
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e3a5f]">
            <div className="flex items-center gap-4">
              <span className="text-xs text-[#8b9bb4]">GIS 电子地图</span>
              <div className="flex items-center gap-1">
                {(['standard', 'thermal', 'fire'] as const).map((layer) => (
                  <button
                    key={layer}
                    onClick={() => setMapLayer(layer)}
                    className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                      mapLayer === layer ? 'bg-[#3b82f6] text-white' : 'text-[#8b9bb4] hover:text-[#e8f1ff]'
                    }`}
                  >
                    {{ standard: '标准', thermal: '热力', fire: '火险' }[layer]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="w-6 h-6 rounded border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6] text-xs flex items-center justify-center">+</button>
              <button className="w-6 h-6 rounded border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6] text-xs flex items-center justify-center">−</button>
              <button className="px-2 py-0.5 rounded border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6] text-[10px]">定位</button>
              <button className="px-2 py-0.5 rounded border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6] text-[10px]">图层</button>
            </div>
          </div>
          <div className="flex-1 relative bg-[#0f1e35] overflow-hidden">
            {/* Simulated map background */}
            <div className="absolute inset-0 opacity-20">
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e3a5f" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>
            {/* Forest area outlines */}
            <div className="absolute inset-0">
              <div className="absolute top-[15%] left-[10%] w-[30%] h-[35%] border border-[#10b981]/20 rounded-lg bg-[#10b981]/5" />
              <div className="absolute top-[20%] left-[45%] w-[25%] h-[40%] border border-[#10b981]/20 rounded-lg bg-[#10b981]/5" />
              <div className="absolute top-[50%] left-[15%] w-[35%] h-[30%] border border-[#10b981]/20 rounded-lg bg-[#10b981]/5" />
              <div className="absolute top-[10%] left-[70%] w-[20%] h-[25%] border border-[#10b981]/20 rounded-lg bg-[#10b981]/5" />
            </div>
            {/* Fire spread overlay */}
            {mapLayer === 'fire' && (
              <div className="absolute top-[25%] left-[35%] w-[15%] h-[20%]">
                <div className="absolute inset-0 bg-[#ef4444]/10 rounded-full animate-alert-breathe" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-[#ef4444]/20 rounded-full" />
              </div>
            )}
            {/* Device markers */}
            {devices.map((device) => (
              <DeviceMarker key={device.id} device={device} onClick={setSelectedDevice} />
            ))}
            {/* Legend */}
            <div className="absolute bottom-3 left-3 bg-[#0c1a2e]/90 border border-[#1e3a5f] rounded px-3 py-2">
              <div className="flex items-center gap-4 text-[10px] text-[#8b9bb4]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#10b981]" />在线</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]" />告警</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#8b9bb4]" />离线</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Alerts */}
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e3a5f]">
            <span className="text-xs text-[#8b9bb4]">实时告警（最新10条）</span>
            <span className="text-[10px] text-[#f59e0b] font-mono">{recentAlerts.filter(a => a.status !== 'resolved' && a.status !== 'false_alarm').length} 条未处理</span>
          </div>
          <div className="flex-1 overflow-auto">
            {recentAlerts.map((alert) => (
              <div key={alert.id} className="px-4 py-3 border-b border-[#1e3a5f]/50 hover:bg-[#1a2d4a] transition-colors cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <AlertBadge level={alert.level} />
                    <span className="text-xs text-[#e8f1ff]">[{alert.type}]</span>
                  </div>
                  <span className="text-[10px] text-[#8b9bb4] font-mono">{alert.time.split(' ')[1]}</span>
                </div>
                <div className="text-xs text-[#8b9bb4] mb-1">{alert.deviceName}</div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#8b9bb4] font-mono">
                    坐标: 东经{alert.lng}°
                  </span>
                  <StatusBadge status={alert.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Device Detail Panel */}
      {selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedDevice(null)}>
          <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg w-[720px] max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e3a5f]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[#e8f1ff]">设备详情</span>
                <span className="text-xs text-[#8b9bb4] font-mono">[{selectedDevice.id}]</span>
                <span className={`text-xs ${selectedDevice.status === 'online' ? 'text-[#10b981]' : selectedDevice.status === 'alarm' ? 'text-[#ef4444]' : 'text-[#8b9bb4]'}`}>
                  {selectedDevice.status === 'online' ? '在线' : selectedDevice.status === 'alarm' ? '告警' : '离线'}
                </span>
              </div>
              <button onClick={() => setSelectedDevice(null)} className="text-[#8b9bb4] hover:text-[#e8f1ff]">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="text-xs"><span className="text-[#8b9bb4]">信号强度: </span><span className="text-[#e8f1ff] font-mono">{selectedDevice.signal}/5</span></div>
                <div className="text-xs"><span className="text-[#8b9bb4]">电池电量: </span><span className="text-[#e8f1ff] font-mono">{selectedDevice.battery}%</span></div>
                <div className="text-xs"><span className="text-[#8b9bb4]">所属林区: </span><span className="text-[#e8f1ff]">{selectedDevice.area}</span></div>
                <div className="text-xs"><span className="text-[#8b9bb4]">最后在线: </span><span className="text-[#e8f1ff] font-mono">{selectedDevice.lastOnline}</span></div>
              </div>
              {selectedDevice.type === 'cloud_platform' && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                    <div className="text-[10px] text-[#8b9bb4] mb-2">可见光画面</div>
                    <div className="aspect-video bg-[#0a1628] rounded flex items-center justify-center text-xs text-[#8b9bb4]">
                      实时视频流
                    </div>
                  </div>
                  <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                    <div className="text-[10px] text-[#8b9bb4] mb-2">红外热成像</div>
                    <div className="aspect-video bg-gradient-to-br from-[#1e3a5f] via-[#f59e0b]/20 to-[#ef4444]/20 rounded flex items-center justify-center text-xs text-[#8b9bb4]">
                      热力图
                    </div>
                  </div>
                  <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                    <div className="text-[10px] text-[#8b9bb4] mb-2">环境参数</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-[#8b9bb4]">温度</span><span className="text-[#e8f1ff] font-mono">{selectedDevice.temperature}℃</span></div>
                      <div className="flex justify-between"><span className="text-[#8b9bb4]">湿度</span><span className="text-[#e8f1ff] font-mono">{selectedDevice.humidity}%</span></div>
                      <div className="flex justify-between"><span className="text-[#8b9bb4]">水平角</span><span className="text-[#e8f1ff] font-mono">{selectedDevice.panAngle}°</span></div>
                      <div className="flex justify-between"><span className="text-[#8b9bb4]">垂直角</span><span className="text-[#e8f1ff] font-mono">{selectedDevice.tiltAngle}°</span></div>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 pt-2">
                <button className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors">云台控制</button>
                <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">录像回放</button>
                <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">远程重启</button>
                <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">告警测试</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
