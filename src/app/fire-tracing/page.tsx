'use client';

import { useState } from 'react';

interface FireEvent {
  id: string;
  name: string;
  origin: { lat: number; lng: number; confidence: string };
  startTime: string;
  status: 'active' | 'contained' | 'extinguished';
  affectedArea: number;
  devices: string[];
  weather: { wind: string; temp: string; humidity: string };
  spread: { '1h': string; '3h': string; '6h': string };
}

const fireEvents: FireEvent[] = [
  {
    id: 'FE-20260802-001',
    name: '红松保护区火情',
    origin: { lat: 42.38, lng: 117.91, confidence: '≤50m' },
    startTime: '2026-08-02 14:21',
    status: 'active',
    affectedArea: 2.3,
    devices: ['ZHL-002', 'ZHL-006', 'ENV-002'],
    weather: { wind: '东南风 4.8m/s', temp: '35℃', humidity: '38%' },
    spread: { '1h': '3.2公顷', '3h': '8.5公顷', '6h': '18.7公顷' },
  },
  {
    id: 'FE-20260801-001',
    name: '针阔混交林火情',
    origin: { lat: 42.43, lng: 118.08, confidence: '≤30m' },
    startTime: '2026-08-01 09:55',
    status: 'extinguished',
    affectedArea: 0.5,
    devices: ['ZHL-006', 'ZHL-003'],
    weather: { wind: '北风 2.1m/s', temp: '28℃', humidity: '55%' },
    spread: { '1h': '0.8公顷', '3h': '1.5公顷', '6h': '2.0公顷' },
  },
  {
    id: 'FE-20260728-001',
    name: '樟子松林区火情',
    origin: { lat: 42.41, lng: 118.05, confidence: '≤40m' },
    startTime: '2026-07-28 15:30',
    status: 'extinguished',
    affectedArea: 1.2,
    devices: ['ZHL-003', 'ZHL-001', 'ENV-001'],
    weather: { wind: '西南风 3.5m/s', temp: '33℃', humidity: '42%' },
    spread: { '1h': '1.8公顷', '3h': '4.2公顷', '6h': '7.5公顷' },
  },
];

export default function FireTracingPage() {
  const [selectedEvent, setSelectedEvent] = useState<FireEvent>(fireEvents[0]);
  const [showSpread, setShowSpread] = useState(false);

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#e8f1ff]">火情溯源与蔓延推演</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSpread(!showSpread)}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              showSpread ? 'bg-[#ef4444] text-white' : 'border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#ef4444] hover:text-[#ef4444]'
            }`}
          >
            {showSpread ? '关闭推演' : '启动蔓延推演'}
          </button>
          <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">
            生成报告
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[320px_1fr] gap-4 min-h-0">
        {/* Event List */}
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-[#1e3a5f]">
            <span className="text-xs text-[#8b9bb4]">历史火情记录</span>
          </div>
          <div className="flex-1 overflow-auto">
            {fireEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className={`w-full text-left px-4 py-3 border-b border-[#1e3a5f]/50 hover:bg-[#1a2d4a] transition-colors ${
                  selectedEvent.id === event.id ? 'bg-[#1a2d4a] border-l-2 border-l-[#3b82f6]' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#e8f1ff] font-medium">{event.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    event.status === 'active' ? 'bg-[#ef4444]/10 text-[#ef4444]' :
                    event.status === 'contained' ? 'bg-[#f59e0b]/10 text-[#f59e0b]' :
                    'bg-[#10b981]/10 text-[#10b981]'
                  }`}>
                    {event.status === 'active' ? '进行中' : event.status === 'contained' ? '已控制' : '已扑灭'}
                  </span>
                </div>
                <div className="text-[10px] text-[#8b9bb4] font-mono">{event.startTime}</div>
                <div className="text-[10px] text-[#8b9bb4] mt-1">过火面积: {event.affectedArea}公顷</div>
              </button>
            ))}
          </div>
        </div>

        {/* Map & Analysis */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Map */}
          <div className="flex-1 bg-[#152238] border border-[#1e3a5f] rounded-lg flex flex-col overflow-hidden min-h-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e3a5f]">
              <span className="text-xs text-[#8b9bb4]">火情态势图</span>
              <div className="flex items-center gap-2 text-[10px] text-[#8b9bb4]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]" />起火点</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f59e0b]" />蔓延范围</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3b82f6]" />防控曲线</span>
              </div>
            </div>
            <div className="flex-1 relative bg-[#0f1e35] overflow-hidden">
              {/* Grid */}
              <div className="absolute inset-0 opacity-20">
                <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="fireGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e3a5f" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#fireGrid)" />
                </svg>
              </div>
              {/* Fire origin */}
              <div className="absolute top-[35%] left-[40%]">
                <div className="relative">
                  <div className="w-4 h-4 rounded-full bg-[#ef4444] animate-alert-pulse" />
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-[#ef4444] whitespace-nowrap font-mono">
                    起火点
                  </div>
                </div>
              </div>
              {/* Spread zones */}
              {showSpread && (
                <>
                  <div className="absolute top-[30%] left-[35%] w-[15%] h-[15%] rounded-full border border-[#f59e0b]/50 bg-[#f59e0b]/10 animate-alert-breathe" />
                  <div className="absolute top-[25%] left-[30%] w-[25%] h-[25%] rounded-full border border-[#f59e0b]/30 bg-[#f59e0b]/5" />
                  <div className="absolute top-[20%] left-[25%] w-[35%] h-[35%] rounded-full border border-[#f59e0b]/20 bg-[#f59e0b]/3" />
                  {/* Control line */}
                  <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
                    <path d="M 20% 30% Q 50% 20% 80% 35%" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" fill="none" />
                  </svg>
                </>
              )}
              {/* Device markers */}
              <div className="absolute top-[30%] left-[38%] w-2 h-2 rounded-full bg-[#10b981] border border-[#0a1628]" title="ZHL-002" />
              <div className="absolute top-[40%] left-[50%] w-2 h-2 rounded-full bg-[#10b981] border border-[#0a1628]" title="ZHL-006" />
              <div className="absolute top-[45%] left-[35%] w-2 h-2 rounded-full bg-[#10b981] border border-[#0a1628]" title="ENV-002" />
            </div>
          </div>

          {/* Analysis Panel */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
              <div className="text-[10px] text-[#8b9bb4] mb-2">起火点溯源</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-[#8b9bb4]">估算坐标</span><span className="text-[#e8f1ff] font-mono">E{selectedEvent.origin.lng}°</span></div>
                <div className="flex justify-between"><span className="text-[#8b9bb4]">定位精度</span><span className="text-[#10b981] font-mono">{selectedEvent.origin.confidence}</span></div>
                <div className="flex justify-between"><span className="text-[#8b9bb4]">确认设备</span><span className="text-[#e8f1ff] font-mono">{selectedEvent.devices.length}台</span></div>
                <div className="flex justify-between"><span className="text-[#8b9bb4]">起始时间</span><span className="text-[#e8f1ff] font-mono">{selectedEvent.startTime.split(' ')[1]}</span></div>
              </div>
            </div>
            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
              <div className="text-[10px] text-[#8b9bb4] mb-2">气象条件</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-[#8b9bb4]">风向风速</span><span className="text-[#e8f1ff]">{selectedEvent.weather.wind}</span></div>
                <div className="flex justify-between"><span className="text-[#8b9bb4]">环境温度</span><span className="text-[#e8f1ff] font-mono">{selectedEvent.weather.temp}</span></div>
                <div className="flex justify-between"><span className="text-[#8b9bb4]">相对湿度</span><span className="text-[#e8f1ff] font-mono">{selectedEvent.weather.humidity}</span></div>
                <div className="flex justify-between"><span className="text-[#8b9bb4]">火险等级</span><span className="text-[#ef4444]">四级(高度危险)</span></div>
              </div>
            </div>
            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
              <div className="text-[10px] text-[#8b9bb4] mb-2">蔓延预测(FARSITE)</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-[#8b9bb4]">1小时后</span><span className="text-[#f59e0b] font-mono">{selectedEvent.spread['1h']}</span></div>
                <div className="flex justify-between"><span className="text-[#8b9bb4]">3小时后</span><span className="text-[#f59e0b] font-mono">{selectedEvent.spread['3h']}</span></div>
                <div className="flex justify-between"><span className="text-[#8b9bb4]">6小时后</span><span className="text-[#ef4444] font-mono">{selectedEvent.spread['6h']}</span></div>
                <div className="flex justify-between"><span className="text-[#8b9bb4]">当前面积</span><span className="text-[#e8f1ff] font-mono">{selectedEvent.affectedArea}公顷</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
