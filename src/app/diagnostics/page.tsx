'use client';

import { useState } from 'react';

interface DiagnosticLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

const logs: DiagnosticLog[] = [
  { id: '1', timestamp: '2026-08-02 14:23:15', level: 'error', source: 'ZHL-002', message: '视频流中断，正在尝试重连...' },
  { id: '2', timestamp: '2026-08-02 14:22:58', level: 'warn', source: 'ENV-008', message: '温度传感器读数异常: 42.3℃' },
  { id: '3', timestamp: '2026-08-02 14:22:30', level: 'info', source: 'System', message: 'AI模型推理完成，耗时 120ms' },
  { id: '4', timestamp: '2026-08-02 14:21:45', level: 'info', source: 'ZHL-003', message: '云台控制指令执行成功' },
  { id: '5', timestamp: '2026-08-02 14:21:12', level: 'warn', source: 'ENV-012', message: '电池电量低于20%，请安排更换' },
  { id: '6', timestamp: '2026-08-02 14:20:30', level: 'info', source: 'System', message: '告警规则引擎加载完成，共 128 条规则' },
  { id: '7', timestamp: '2026-08-02 14:19:55', level: 'error', source: 'ZHL-009', message: '设备离线，最后心跳: 14:15:00' },
  { id: '8', timestamp: '2026-08-02 14:19:20', level: 'info', source: 'System', message: '数据同步完成，上传 1,247 条记录' },
  { id: '9', timestamp: '2026-08-02 14:18:45', level: 'warn', source: 'Gateway-02', message: '网络延迟升高: RTT 180ms' },
  { id: '10', timestamp: '2026-08-02 14:18:00', level: 'info', source: 'System', message: '视频编码切换: H.265 → H.264 (低带宽)' },
];

export default function DiagnosticsPage() {
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');

  const filteredLogs = filter === 'all' ? logs : logs.filter((l) => l.level === filter);

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#e8f1ff]">运维诊断</h1>
        <div className="flex items-center gap-3">
          <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">
            导出日志
          </button>
          <button className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors">
            刷新
          </button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">系统健康度</div>
          <div className="text-2xl font-bold font-mono text-[#10b981]">96.5%</div>
          <div className="text-[10px] text-[#8b9bb4] mt-1">运行正常</div>
        </div>
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">CPU使用率</div>
          <div className="text-2xl font-bold font-mono text-[#3b82f6]">42%</div>
          <div className="text-[10px] text-[#8b9bb4] mt-1">8核 / 32GB</div>
        </div>
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">存储使用</div>
          <div className="text-2xl font-bold font-mono text-[#06b6d4]">68%</div>
          <div className="text-[10px] text-[#8b9bb4] mt-1">6.8TB / 10TB</div>
        </div>
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">网络带宽</div>
          <div className="text-2xl font-bold font-mono text-[#f59e0b]">245<span className="text-sm">Mbps</span></div>
          <div className="text-[10px] text-[#8b9bb4] mt-1">峰值 380Mbps</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#8b9bb4]">日志级别:</span>
        {(['all', 'error', 'warn', 'info'] as const).map((level) => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              filter === level
                ? level === 'error' ? 'bg-[#ef4444]/20 text-[#ef4444]'
                  : level === 'warn' ? 'bg-[#f59e0b]/20 text-[#f59e0b]'
                  : level === 'info' ? 'bg-[#3b82f6]/20 text-[#3b82f6]'
                  : 'bg-[#3b82f6]/20 text-[#3b82f6]'
                : 'text-[#8b9bb4] hover:text-[#e8f1ff]'
            }`}
          >
            {level === 'all' ? '全部' : level === 'error' ? '错误' : level === 'warn' ? '警告' : '信息'}
          </button>
        ))}
        <span className="text-[10px] text-[#8b9bb4] ml-auto">共 {filteredLogs.length} 条</span>
      </div>

      {/* Log Table */}
      <div className="flex-1 bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden flex flex-col min-h-0">
        <table className="w-full">
          <thead className="bg-[#0f1e35]">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4] w-40">时间</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4] w-20">级别</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4] w-28">来源</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">消息</th>
            </tr>
          </thead>
          <tbody className="overflow-auto">
            {filteredLogs.map((log) => (
              <tr key={log.id} className="border-t border-[#1e3a5f]/50 hover:bg-[#1a2d4a] transition-colors">
                <td className="px-4 py-2 text-xs text-[#8b9bb4] font-mono">{log.timestamp}</td>
                <td className="px-4 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    log.level === 'error' ? 'bg-[#ef4444]/10 text-[#ef4444]'
                    : log.level === 'warn' ? 'bg-[#f59e0b]/10 text-[#f59e0b]'
                    : 'bg-[#3b82f6]/10 text-[#3b82f6]'
                  }`}>
                    {log.level === 'error' ? 'ERROR' : log.level === 'warn' ? 'WARN' : 'INFO'}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-[#e8f1ff] font-mono">{log.source}</td>
                <td className="px-4 py-2 text-xs text-[#8b9bb4]">{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
