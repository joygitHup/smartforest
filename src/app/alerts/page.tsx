'use client';

import { useState } from 'react';
import { alerts, type Alert } from '@/lib/mock-data';
import Pagination, { usePagination } from '@/components/ui/pagination';

const levelConfig: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: '一级(紧急)', color: 'text-[#ef4444]', bg: 'bg-[#ef4444]/10 border-[#ef4444]/30' },
  2: { label: '二级(预警)', color: 'text-[#f59e0b]', bg: 'bg-[#f59e0b]/10 border-[#f59e0b]/30' },
  3: { label: '三级(提示)', color: 'text-[#3b82f6]', bg: 'bg-[#3b82f6]/10 border-[#3b82f6]/30' },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'text-[#f59e0b]' },
  dispatched: { label: '已派单', color: 'text-[#3b82f6]' },
  processing: { label: '处置中', color: 'text-[#06b6d4]' },
  resolved: { label: '已处置', color: 'text-[#10b981]' },
  false_alarm: { label: '误报', color: 'text-[#8b9bb4]' },
};

export default function AlertsPage() {
  const [levelFilter, setLevelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const { current, pageSize, onPageChange, onPageSizeChange } = usePagination(10);

  const filtered = alerts.filter((a) => {
    if (levelFilter !== 'all' && a.level !== Number(levelFilter)) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (search && !a.deviceName.includes(search) && !a.id.toLowerCase().includes(search.toLowerCase()) && !a.area.includes(search)) return false;
    return true;
  });

  const paged = filtered.slice((current - 1) * pageSize, current * pageSize);

  const stats = {
    total: alerts.length,
    pending: alerts.filter(a => a.status === 'pending').length,
    level1: alerts.filter(a => a.level === 1 && a.status !== 'resolved' && a.status !== 'false_alarm').length,
    level2: alerts.filter(a => a.level === 2 && a.status !== 'resolved' && a.status !== 'false_alarm').length,
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#e8f1ff]">告警中心</h1>
        <div className="flex items-center gap-3">
          <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">
            导出报表
          </button>
          <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">
            告警规则配置
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">告警总数</div>
          <div className="text-2xl font-bold font-mono text-[#e8f1ff]">{stats.total}</div>
        </div>
        <div className="bg-[#152238] border border-[#f59e0b]/30 rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">待处理</div>
          <div className="text-2xl font-bold font-mono text-[#f59e0b]">{stats.pending}</div>
        </div>
        <div className="bg-[#152238] border border-[#ef4444]/30 rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">一级告警(未处理)</div>
          <div className="text-2xl font-bold font-mono text-[#ef4444]">{stats.level1}</div>
        </div>
        <div className="bg-[#152238] border border-[#f59e0b]/30 rounded-lg p-4">
          <div className="text-xs text-[#8b9bb4] mb-1">二级告警(未处理)</div>
          <div className="text-2xl font-bold font-mono text-[#f59e0b]">{stats.level2}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="搜索告警ID、设备名称、区域..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6] w-72"
        />
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
        >
          <option value="all">全部等级</option>
          <option value="1">一级(紧急)</option>
          <option value="2">二级(预警)</option>
          <option value="3">三级(提示)</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
        >
          <option value="all">全部状态</option>
          <option value="pending">待处理</option>
          <option value="dispatched">已派单</option>
          <option value="processing">处置中</option>
          <option value="resolved">已处置</option>
          <option value="false_alarm">误报</option>
        </select>
      </div>

      {/* Alert List */}
      <div className="flex-1 bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full">
            <thead className="bg-[#0f1e35] sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">告警ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">等级</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">类型</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">设备/区域</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">AI置信度</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">时间</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">状态</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">操作</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((alert) => (
                <tr
                  key={alert.id}
                  className={`border-t border-[#1e3a5f]/50 hover:bg-[#1a2d4a] transition-colors cursor-pointer ${
                    alert.level === 1 && alert.status !== 'resolved' && alert.status !== 'false_alarm' ? 'bg-[#ef4444]/5' : ''
                  }`}
                  onClick={() => setSelectedAlert(alert)}
                >
                  <td className="px-4 py-3 text-xs text-[#e8f1ff] font-mono">{alert.id}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] border ${levelConfig[alert.level]?.bg} ${levelConfig[alert.level]?.color}`}>
                      {alert.level === 1 && <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] mr-1 animate-pulse" />}
                      {levelConfig[alert.level]?.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#e8f1ff]">{alert.type}</td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-[#e8f1ff]">{alert.deviceName}</div>
                    <div className="text-[10px] text-[#8b9bb4]">{alert.area}</div>
                  </td>
                  <td className="px-4 py-3">
                    {alert.confidence > 0 ? (
                      <span className={`text-xs font-mono ${alert.confidence >= 85 ? 'text-[#ef4444]' : alert.confidence >= 70 ? 'text-[#f59e0b]' : 'text-[#8b9bb4]'}`}>
                        {alert.confidence}%
                      </span>
                    ) : (
                      <span className="text-xs text-[#8b9bb4]">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#8b9bb4] font-mono">{alert.time}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${statusConfig[alert.status]?.color}`}>
                      {statusConfig[alert.status]?.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors">
                      处置
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

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedAlert(null)}>
          <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg w-[680px] max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e3a5f]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[#e8f1ff]">告警详情</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] border ${levelConfig[selectedAlert.level]?.bg} ${levelConfig[selectedAlert.level]?.color}`}>
                  {levelConfig[selectedAlert.level]?.label}
                </span>
              </div>
              <button onClick={() => setSelectedAlert(null)} className="text-[#8b9bb4] hover:text-[#e8f1ff]">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                  <div className="text-[10px] text-[#8b9bb4] mb-2">告警信息</div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">告警ID</span><span className="text-[#e8f1ff] font-mono">{selectedAlert.id}</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">告警类型</span><span className="text-[#e8f1ff]">{selectedAlert.type}</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">触发设备</span><span className="text-[#e8f1ff]">{selectedAlert.deviceName}</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">所属区域</span><span className="text-[#e8f1ff]">{selectedAlert.area}</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">GPS坐标</span><span className="text-[#e8f1ff] font-mono">东经{selectedAlert.lng}°</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">触发时间</span><span className="text-[#e8f1ff] font-mono">{selectedAlert.time}</span></div>
                  </div>
                </div>
                <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                  <div className="text-[10px] text-[#8b9bb4] mb-2">AI分析</div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">AI置信度</span><span className={`font-mono ${selectedAlert.confidence >= 85 ? 'text-[#ef4444]' : 'text-[#f59e0b]'}`}>{selectedAlert.confidence}%</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">当前状态</span><span className={statusConfig[selectedAlert.status]?.color}>{statusConfig[selectedAlert.status]?.label}</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">响应时限</span><span className="text-[#e8f1ff] font-mono">{selectedAlert.level === 1 ? '30秒' : selectedAlert.level === 2 ? '2分钟' : '5分钟'}</span></div>
                    <div className="flex justify-between"><span className="text-[#8b9bb4]">推送方式</span><span className="text-[#e8f1ff]">{selectedAlert.level === 1 ? '站内信+短信+语音+专线' : selectedAlert.level === 2 ? '站内信+短信+语音' : '站内信+App'}</span></div>
                  </div>
                </div>
              </div>
              <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                <div className="text-[10px] text-[#8b9bb4] mb-2">告警描述</div>
                <p className="text-xs text-[#e8f1ff] leading-relaxed">{selectedAlert.description}</p>
              </div>
              {selectedAlert.screenshot && (
                <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                  <div className="text-[10px] text-[#8b9bb4] mb-2">现场截图</div>
                  <div className="aspect-video bg-[#0a1628] rounded flex items-center justify-center text-xs text-[#8b9bb4]">
                    告警截图 / 视频片段
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 pt-2">
                {selectedAlert.status === 'pending' && (
                  <>
                    <button className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors">接单处置</button>
                    <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">导航至火点</button>
                  </>
                )}
                {selectedAlert.status === 'dispatched' && (
                  <>
                    <button className="px-3 py-1.5 text-xs bg-[#06b6d4] text-white rounded hover:bg-[#0891b2] transition-colors">开始处置</button>
                    <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">请求增援</button>
                  </>
                )}
                {(selectedAlert.status === 'processing') && (
                  <>
                    <button className="px-3 py-1.5 text-xs bg-[#10b981] text-white rounded hover:bg-[#059669] transition-colors">标记已控制</button>
                    <button className="px-3 py-1.5 text-xs border border-[#f59e0b]/30 text-[#f59e0b] rounded hover:bg-[#f59e0b]/10 transition-colors">请求增援</button>
                    <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">上报误报</button>
                  </>
                )}
                <button className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors ml-auto">查看处置记录</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
