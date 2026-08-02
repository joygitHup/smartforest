'use client';

import { useState } from 'react';
import { envHistory, alerts, dashboardStats } from '@/lib/mock-data';

type ReportTab = 'daily' | 'device' | 'alert' | 'environment';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('daily');

  const tabs: { key: ReportTab; label: string }[] = [
    { key: 'daily', label: '日报概览' },
    { key: 'device', label: '设备统计' },
    { key: 'alert', label: '告警分析' },
    { key: 'environment', label: '环境数据' },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#e8f1ff]">报表中心</h1>
        <div className="flex items-center gap-3">
          <select className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]">
            <option>2026-08-02</option>
            <option>2026-08-01</option>
            <option>2026-07-31</option>
          </select>
          <button className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors">
            导出 PDF
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-[#0f1e35] border border-[#1e3a5f] rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 text-xs rounded transition-colors ${
              activeTab === tab.key ? 'bg-[#3b82f6] text-white' : 'text-[#8b9bb4] hover:text-[#e8f1ff]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'daily' && <DailyReport />}
        {activeTab === 'device' && <DeviceReport />}
        {activeTab === 'alert' && <AlertReport />}
        {activeTab === 'environment' && <EnvironmentReport />}
      </div>
    </div>
  );
}

function DailyReport() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">在线设备率</div>
          <div className="text-2xl font-bold font-mono text-[#10b981]">90.4%</div>
          <div className="text-[10px] text-[#8b9bb4] mt-1">1247/1380 台</div>
        </div>
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">告警处理率</div>
          <div className="text-2xl font-bold font-mono text-[#3b82f6]">95.7%</div>
          <div className="text-[10px] text-[#8b9bb4] mt-1">22/23 已处理</div>
        </div>
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">平均响应时间</div>
          <div className="text-2xl font-bold font-mono text-[#06b6d4]">4.2<span className="text-sm">min</span></div>
          <div className="text-[10px] text-[#8b9bb4] mt-1">较昨日 -0.8min</div>
        </div>
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">误报率</div>
          <div className="text-2xl font-bold font-mono text-[#f59e0b]">3.2%</div>
          <div className="text-[10px] text-[#8b9bb4] mt-1">持续优化中</div>
        </div>
      </div>

      <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
        <div className="text-xs text-[#8b9bb4] mb-3">今日告警趋势</div>
        <div className="h-40 flex items-end gap-1">
          {[12, 8, 5, 3, 2, 4, 15, 28, 45, 62, 78, 55, 42, 38, 35, 48, 65, 72, 58, 42, 28, 18, 12, 8].map((val, i) => {
            const height = Math.max(4, val);
            const isAlert = height > 60;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t ${isAlert ? 'bg-[#ef4444]/60' : 'bg-[#3b82f6]/60'}`}
                  style={{ height: `${height}%` }}
                />
                {i % 4 === 0 && <span className="text-[9px] text-[#8b9bb4]">{i}:00</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-3">告警类型分布</div>
          <div className="space-y-2">
            {[
              { type: '火情', count: 3, pct: 13, color: 'bg-[#ef4444]' },
              { type: '高温', count: 4, pct: 17, color: 'bg-[#f59e0b]' },
              { type: '烟雾', count: 2, pct: 9, color: 'bg-[#06b6d4]' },
              { type: '设备故障', count: 8, pct: 35, color: 'bg-[#3b82f6]' },
              { type: '低电量', count: 6, pct: 26, color: 'bg-[#8b9bb4]' },
            ].map((item) => (
              <div key={item.type} className="flex items-center gap-3">
                <span className="text-xs text-[#8b9bb4] w-16">{item.type}</span>
                <div className="flex-1 h-2 bg-[#0f1e35] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                </div>
                <span className="text-xs text-[#e8f1ff] font-mono w-8 text-right">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-3">林区告警排名</div>
          <div className="space-y-2">
            {[
              { area: '红松保护区', count: 8, level: 'high' },
              { area: '南部边界', count: 5, level: 'medium' },
              { area: '樟子松林区', count: 4, level: 'medium' },
              { area: '落叶松林区', count: 3, level: 'low' },
              { area: '白桦林保护区', count: 3, level: 'low' },
            ].map((item, idx) => (
              <div key={item.area} className="flex items-center gap-3">
                <span className={`text-xs font-mono w-4 ${idx < 2 ? 'text-[#ef4444]' : 'text-[#8b9bb4]'}`}>{idx + 1}</span>
                <span className="text-xs text-[#e8f1ff] flex-1">{item.area}</span>
                <span className={`text-xs font-mono ${item.level === 'high' ? 'text-[#ef4444]' : item.level === 'medium' ? 'text-[#f59e0b]' : 'text-[#8b9bb4]'}`}>
                  {item.count}次
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeviceReport() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">设备可用率</div>
          <div className="text-2xl font-bold font-mono text-[#10b981]">97.2%</div>
        </div>
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">平均在线时长</div>
          <div className="text-2xl font-bold font-mono text-[#3b82f6]">22.8<span className="text-sm">h</span></div>
        </div>
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">故障设备</div>
          <div className="text-2xl font-bold font-mono text-[#ef4444]">3<span className="text-sm">台</span></div>
        </div>
      </div>
      <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
        <div className="text-xs text-[#8b9bb4] mb-3">设备类型分布</div>
        <div className="grid grid-cols-4 gap-4">
          {[
            { type: '双目云台', count: 520, online: 498, color: '#3b82f6' },
            { type: '环境传感器', count: 680, online: 632, color: '#10b981' },
            { type: '边缘网关', count: 120, online: 117, color: '#06b6d4' },
            { type: '巡检无人机', count: 60, online: 55, color: '#f59e0b' },
          ].map((item) => (
            <div key={item.type} className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
              <div className="text-xs text-[#8b9bb4] mb-2">{item.type}</div>
              <div className="text-xl font-bold font-mono" style={{ color: item.color }}>{item.count}</div>
              <div className="text-[10px] text-[#8b9bb4] mt-1">在线 {item.online} 台</div>
              <div className="w-full h-1 bg-[#1e3a5f] rounded-full mt-2 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(item.online / item.count) * 100}%`, backgroundColor: item.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AlertReport() {
  const alertStats = [
    { level: '一级', total: 5, resolved: 4, avgTime: '28秒' },
    { level: '二级', total: 12, resolved: 11, avgTime: '1.8分钟' },
    { level: '三级', total: 6, resolved: 6, avgTime: '4.2分钟' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#0f1e35]">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">告警等级</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">总数</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">已处理</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">处理率</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">平均响应时间</th>
            </tr>
          </thead>
          <tbody>
            {alertStats.map((stat) => (
              <tr key={stat.level} className="border-t border-[#1e3a5f]/50">
                <td className="px-4 py-3 text-xs text-[#e8f1ff]">{stat.level}</td>
                <td className="px-4 py-3 text-xs text-[#e8f1ff] font-mono">{stat.total}</td>
                <td className="px-4 py-3 text-xs text-[#10b981] font-mono">{stat.resolved}</td>
                <td className="px-4 py-3 text-xs text-[#e8f1ff] font-mono">{((stat.resolved / stat.total) * 100).toFixed(1)}%</td>
                <td className="px-4 py-3 text-xs text-[#e8f1ff] font-mono">{stat.avgTime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EnvironmentReport() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">日均温度</div>
          <div className="text-2xl font-bold font-mono text-[#f59e0b]">28.5<span className="text-sm">℃</span></div>
          <div className="text-[10px] text-[#8b9bb4] mt-1">最高 35.2℃ / 最低 21.8℃</div>
        </div>
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">日均湿度</div>
          <div className="text-2xl font-bold font-mono text-[#3b82f6]">52.3<span className="text-sm">%RH</span></div>
          <div className="text-[10px] text-[#8b9bb4] mt-1">最高 78% / 最低 32%</div>
        </div>
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">日均风速</div>
          <div className="text-2xl font-bold font-mono text-[#06b6d4]">3.8<span className="text-sm">m/s</span></div>
          <div className="text-[10px] text-[#8b9bb4] mt-1">最大 8.2m/s</div>
        </div>
      </div>

      <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
        <div className="text-xs text-[#8b9bb4] mb-3">24小时温度变化</div>
        <div className="h-40 flex items-end gap-0.5">
          {envHistory.map((d, i) => {
            const height = ((d.temperature - 18) / 20) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t bg-[#f59e0b]/60" style={{ height: `${Math.max(4, height)}%` }} />
                {i % 4 === 0 && <span className="text-[9px] text-[#8b9bb4]">{d.time}</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
        <div className="text-xs text-[#8b9bb4] mb-3">24小时湿度变化</div>
        <div className="h-40 flex items-end gap-0.5">
          {envHistory.map((d, i) => {
            const height = (d.humidity / 100) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t bg-[#3b82f6]/60" style={{ height: `${Math.max(4, height)}%` }} />
                {i % 4 === 0 && <span className="text-[9px] text-[#8b9bb4]">{d.time}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
