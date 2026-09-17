'use client';

import { useState, useEffect, useCallback } from 'react';
import Pagination, { usePagination } from '@/components/ui/pagination';
import { AuthGuard } from '@/components/auth-guard';
import { useRegionFilter } from '@/contexts/RegionFilterContext';
import {
  getAlerts,
  getAlert,
  getAlertStatistics,
  getAlertActions,
  acceptAndDispatchAlert,
  startProcessingAlert,
  resolveAlert,
  escalateAlert,
  startFireTracing,
  exportAlerts,
  requestReinforcement,
  getAlertNavigation,
} from '@/lib/api/alerts';
import { getUsers, type OrgUser } from '@/lib/api/organization';
import { aimDeviceAtAlert } from '@/lib/api/devices';
import type {
  AlertListItem,
  AlertDetail,
  AlertAction,
  AlertStatistics,
} from '@/types/alert';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const levelConfig: Record<string, { label: string; color: string; bg: string; num: number }> = {
  level_1: { label: '一级(紧急)', color: 'text-[#ef4444]', bg: 'bg-[#ef4444]/10 border-[#ef4444]/30', num: 1 },
  level_2: { label: '二级(预警)', color: 'text-[#f59e0b]', bg: 'bg-[#f59e0b]/10 border-[#f59e0b]/30', num: 2 },
  level_3: { label: '三级(提示)', color: 'text-[#3b82f6]', bg: 'bg-[#3b82f6]/10 border-[#3b82f6]/30', num: 3 },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  new: { label: '待处理', color: 'text-[#f59e0b]' },
  acknowledged: { label: '已确认', color: 'text-[#a78bfa]' },
  dispatched: { label: '已派单', color: 'text-[#3b82f6]' },
  processing: { label: '处置中', color: 'text-[#06b6d4]' },
  resolved: { label: '已处置', color: 'text-[#10b981]' },
  false_alarm: { label: '误报', color: 'text-[#8b9bb4]' },
  escalated: { label: '已升级', color: 'text-[#ef4444]' },
};

function confidencePercent(value?: number | null): number {
  if (value === null || value === undefined) return 0;
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
}

function formatTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function displayText(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function AlertsPageContent() {
  const router = useRouter();
  const [levelFilter, setLevelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const { region, area } = useRegionFilter();
  const [alerts, setAlerts] = useState<AlertListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<AlertStatistics | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showReinforce, setShowReinforce] = useState(false);
  const [reinforceReason, setReinforceReason] = useState('');
  const [reinforceContact, setReinforceContact] = useState('');
  const [reinforcePeople, setReinforcePeople] = useState(2);

  const [showDispatch, setShowDispatch] = useState(false);
  const [assigneeUsers, setAssigneeUsers] = useState<OrgUser[]>([]);
  const [assigneeLoading, setAssigneeLoading] = useState(false);
  const [assigneeId, setAssigneeId] = useState<number | ''>('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [dispatchNote, setDispatchNote] = useState('');
  const [dispatchSelf, setDispatchSelf] = useState(false);

  const [selectedAlert, setSelectedAlert] = useState<AlertDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  const [showActions, setShowActions] = useState(false);
  const [actions, setActions] = useState<AlertAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);

  const { current, pageSize, onPageChange, onPageSizeChange } = usePagination(10);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const levelMap: Record<string, string> = {
        '1': 'level_1',
        '2': 'level_2',
        '3': 'level_3',
      };
      const response = await getAlerts({
        page: current,
        page_size: pageSize,
        search: search || undefined,
        alert_level: levelFilter !== 'all' ? levelMap[levelFilter] || levelFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        forest_zone: region || undefined,
        region: area || undefined,
      });
      setAlerts(response.results);
      setTotalCount(response.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取告警列表失败');
      setAlerts([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [current, pageSize, search, levelFilter, statusFilter, region, area]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getAlertStatistics(24 * 7);
      setStats(data);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      if (current !== 1) onPageChange(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (current !== 1) onPageChange(1);
  }, [region, area]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetail = async (item: AlertListItem) => {
    setSelectedAlert(item as AlertDetail);
    setDetailLoading(true);
    setDetailError('');
    setActionMessage('');
    setShowActions(false);
    try {
      const detail = await getAlert(item.id);
      setSelectedAlert(detail);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : '获取告警详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async (id: number) => {
    const detail = await getAlert(id);
    setSelectedAlert(detail);
    await fetchList();
    await fetchStats();
  };

  const runAction = async (fn: () => Promise<unknown>, successHint?: string): Promise<boolean> => {
    if (!selectedAlert) return false;
    setActionLoading(true);
    setActionMessage('');
    try {
      const result = await fn();
      const message =
        successHint ||
        (result && typeof result === 'object' && 'message' in result
          ? String((result as { message: string }).message)
          : '操作成功');
      setActionMessage(message);
      await refreshDetail(selectedAlert.id);
      return true;
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : '操作失败');
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const loadActions = async () => {
    if (!selectedAlert) return;
    setShowActions(true);
    setActionsLoading(true);
    try {
      const list = await getAlertActions(selectedAlert.id);
      setActions(list);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : '获取处置记录失败');
    } finally {
      setActionsLoading(false);
    }
  };

  const cardStats = {
    total: stats?.total ?? totalCount,
    unresolved: stats?.unresolved_count ?? 0,
    level1: stats?.unresolved_level_1 ?? stats?.by_level?.level_1 ?? 0,
    level2: stats?.unresolved_level_2 ?? stats?.by_level?.level_2 ?? 0,
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const levelMap: Record<string, string> = {
        '1': 'level_1',
        '2': 'level_2',
        '3': 'level_3',
      };
      await exportAlerts({
        search: search || undefined,
        alert_level: levelFilter !== 'all' ? levelMap[levelFilter] || levelFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleNavigate = async () => {
    if (!selectedAlert) return;
    setActionLoading(true);
    setActionMessage('');
    try {
      const nav = await getAlertNavigation(selectedAlert.id);
      if (nav.amap_url) {
        window.open(nav.amap_url, '_blank', 'noopener,noreferrer');
        setActionMessage(`已打开地图导航（来源: ${nav.source}）`);
      } else {
        setActionMessage(nav.message || '暂无坐标');
      }
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : '导航失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReinforce = async () => {
    if (!selectedAlert || !reinforceReason.trim()) {
      setActionMessage('请填写增援事由');
      return;
    }
    await runAction(
      () =>
        requestReinforcement(selectedAlert.id, {
          reason: reinforceReason.trim(),
          contact: reinforceContact.trim() || undefined,
          required_people: reinforcePeople,
        }),
      '增援申请已提交'
    );
    setShowReinforce(false);
    setReinforceReason('');
  };

  const openDispatchDialog = async () => {
    setShowDispatch(true);
    setShowReinforce(false);
    setDispatchSelf(false);
    setAssigneeId('');
    setDispatchNote('');
    setAssigneeSearch('');
    setAssigneeLoading(true);
    try {
      const res = await getUsers({ page: 1, page_size: 100, is_active: true });
      setAssigneeUsers(res.results);
    } catch {
      setAssigneeUsers([]);
      setActionMessage('加载用户列表失败，仍可自己接单');
    } finally {
      setAssigneeLoading(false);
    }
  };

  const filteredAssignees = assigneeUsers.filter((u) => {
    if (!assigneeSearch.trim()) return true;
    const q = assigneeSearch.trim().toLowerCase();
    const name = `${u.last_name || ''}${u.first_name || ''}`.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      name.includes(q) ||
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q)
    );
  });

  const handleDispatch = async () => {
    if (!selectedAlert) return;
    if (!dispatchSelf && !assigneeId) {
      setActionMessage('请选择处理人，或勾选「自己接单」');
      return;
    }
    const selectedUser = dispatchSelf
      ? null
      : assigneeUsers.find((u) => u.id === assigneeId);
    const ok = await runAction(
      () =>
        acceptAndDispatchAlert(selectedAlert.id, {
          assigneeId: selectedUser?.id,
          assignedTo: selectedUser
            ? `${selectedUser.last_name || ''}${selectedUser.first_name || ''}`.trim() ||
              selectedUser.username
            : undefined,
          note: dispatchNote.trim() || undefined,
        })
    );
    if (ok) setShowDispatch(false);
  };

  const status = selectedAlert?.status || '';
  const canAccept = status === 'new' || status === 'escalated' || status === 'acknowledged';
  const canProcess = status === 'dispatched';
  const canResolve = status === 'processing' || status === 'dispatched';
  const canEscalate = selectedAlert?.alert_level === 'level_1' && !['resolved', 'false_alarm', 'escalated'].includes(status);
  const canFireTrace =
    (selectedAlert?.alert_type === 'fire' || selectedAlert?.alert_type === 'smoke') &&
    !selectedAlert?.fire_tracing;
  const canReinforce = !!selectedAlert && !['resolved', 'false_alarm'].includes(status);
  const canAim =
    !!selectedAlert?.device &&
    selectedAlert.latitude != null &&
    selectedAlert.longitude != null;

  const handleAimAlert = async () => {
    if (!selectedAlert?.device) return;
    setActionLoading(true);
    try {
      const res = await aimDeviceAtAlert(selectedAlert.device, selectedAlert.id);
      window.alert(res.message || '已发送对准指令');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '告警对准失败');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#e8f1ff]">告警记录</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExport()}
            className="px-3 py-1.5 text-sm border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors disabled:opacity-50"
          >
            {exporting ? '导出中...' : '导出报表'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/alerts/handling')}
            className="px-3 py-1.5 text-sm border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors"
          >
            处理记录
          </button>
          <button
            type="button"
            onClick={() => router.push('/rules/alert-rules')}
            className="px-3 py-1.5 text-sm border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors"
          >
            告警规则配置
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-sm text-[#8b9bb4] mb-1">告警总数{stats ? `（${stats.period}）` : ''}</div>
          <div className="text-2xl font-bold font-mono text-[#e8f1ff]">{cardStats.total}</div>
        </div>
        <div className="bg-[#152238] border border-[#f59e0b]/30 rounded-lg p-4">
          <div className="text-sm text-[#8b9bb4] mb-1">待处理/未关闭</div>
          <div className="text-2xl font-bold font-mono text-[#f59e0b]">{cardStats.unresolved}</div>
        </div>
        <div className="bg-[#152238] border border-[#ef4444]/30 rounded-lg p-4">
          <div className="text-sm text-[#8b9bb4] mb-1">一级告警(未关闭)</div>
          <div className="text-2xl font-bold font-mono text-[#ef4444]">{cardStats.level1}</div>
        </div>
        <div className="bg-[#152238] border border-[#f59e0b]/30 rounded-lg p-4">
          <div className="text-sm text-[#8b9bb4] mb-1">二级告警(未关闭)</div>
          <div className="text-2xl font-bold font-mono text-[#f59e0b]">{cardStats.level2}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="搜索告警ID、设备名称、区域..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6] w-72"
        />
        <select
          value={levelFilter}
          onChange={(e) => {
            setLevelFilter(e.target.value);
            onPageChange(1);
          }}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-sm text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
        >
          <option value="all">全部等级</option>
          <option value="1">一级(紧急)</option>
          <option value="2">二级(预警)</option>
          <option value="3">三级(提示)</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            onPageChange(1);
          }}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-sm text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
        >
          <option value="all">全部状态</option>
          <option value="new">待处理(新告警)</option>
          <option value="acknowledged">已确认</option>
          <option value="dispatched">已派单</option>
          <option value="processing">处置中</option>
          <option value="resolved">已处置</option>
          <option value="false_alarm">误报</option>
          <option value="escalated">已升级</option>
        </select>
        <span className="text-sm text-[#8b9bb4] ml-auto">
          共 <span className="text-[#e8f1ff] font-mono">{totalCount}</span> 条
        </span>
      </div>

      <div className="flex-1 bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-full min-h-[200px]">
              <div className="w-12 h-12 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full min-h-[200px]">
              <div className="text-center">
                <p className="text-sm text-[#ef4444] mb-2">{error}</p>
                <button
                  onClick={() => void fetchList()}
                  className="px-3 py-1.5 text-sm bg-[#3b82f6] text-white rounded hover:bg-[#2563eb]"
                >
                  重试
                </button>
              </div>
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[200px]">
              <p className="text-sm text-[#8b9bb4]">暂无告警数据</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-[#0f1e35] sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">告警ID</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">等级</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">类型</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">设备/区域</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">AI置信度</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">时间</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">状态</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">操作</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => {
                  const level = levelConfig[alert.alert_level] || levelConfig.level_3;
                  const conf = confidencePercent(alert.ai_confidence);
                  const unresolved = !['resolved', 'false_alarm'].includes(alert.status);
                  return (
                    <tr
                      key={alert.id}
                      className={`border-t border-[#1e3a5f]/50 hover:bg-[#1a2d4a] transition-colors cursor-pointer ${
                        alert.alert_level === 'level_1' && unresolved ? 'bg-[#ef4444]/5' : ''
                      }`}
                      onClick={() => void openDetail(alert)}
                    >
                      <td className="px-4 py-3 text-sm text-[#e8f1ff] font-mono">{alert.alert_id}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] border ${level.bg} ${level.color}`}>
                          {level.num === 1 && <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] mr-1 animate-pulse" />}
                          {alert.alert_level_display || level.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#e8f1ff]">
                        {alert.alert_type_display || alert.alert_type}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-[#e8f1ff]">{alert.device_name || '-'}</div>
                        <div className="text-[10px] text-[#8b9bb4]">
                          {alert.forest_zone || alert.region || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {conf > 0 ? (
                          <span
                            className={`text-sm font-mono ${
                              conf >= 85 ? 'text-[#ef4444]' : conf >= 70 ? 'text-[#f59e0b]' : 'text-[#8b9bb4]'
                            }`}
                          >
                            {conf}%
                          </span>
                        ) : (
                          <span className="text-sm text-[#8b9bb4]">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#8b9bb4] font-mono">
                        {formatTime(alert.occurred_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${statusConfig[alert.status]?.color || 'text-[#8b9bb4]'}`}>
                          {alert.status_display || statusConfig[alert.status]?.label || alert.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-sm text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            void openDetail(alert);
                          }}
                        >
                          处置
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {!loading && !error && totalCount > 0 && (
          <div className="border-t border-[#1e3a5f]">
            <Pagination
              current={current}
              pageSize={pageSize}
              total={totalCount}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </div>
        )}
      </div>

      {selectedAlert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setSelectedAlert(null)}
        >
          <div
            className="bg-[#152238] border border-[#1e3a5f] rounded-lg w-[720px] max-h-[85vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e3a5f]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[#e8f1ff]">告警详情</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] border ${
                    levelConfig[selectedAlert.alert_level]?.bg || ''
                  } ${levelConfig[selectedAlert.alert_level]?.color || ''}`}
                >
                  {selectedAlert.alert_level_display ||
                    levelConfig[selectedAlert.alert_level]?.label ||
                    selectedAlert.alert_level}
                </span>
              </div>
              <button onClick={() => setSelectedAlert(null)} className="text-[#8b9bb4] hover:text-[#e8f1ff]">
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {detailLoading ? (
                <div className="flex justify-center py-12">
                  <div className="w-10 h-10 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : detailError ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[#ef4444] mb-3">{detailError}</p>
                  <button
                    onClick={() => void openDetail(selectedAlert)}
                    className="px-3 py-1.5 text-sm bg-[#3b82f6] text-white rounded"
                  >
                    重试
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                      <div className="text-[10px] text-[#8b9bb4] mb-2">告警信息</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="text-[#8b9bb4]">告警ID</span>
                          <span className="text-[#e8f1ff] font-mono">{selectedAlert.alert_id}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-[#8b9bb4]">标题</span>
                          <span className="text-[#e8f1ff] text-right">{displayText(selectedAlert.title)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-[#8b9bb4]">告警类型</span>
                          <span className="text-[#e8f1ff]">
                            {selectedAlert.alert_type_display || selectedAlert.alert_type}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-[#8b9bb4]">触发设备</span>
                          <span className="text-[#e8f1ff]">
                            {selectedAlert.device_name} ({selectedAlert.device_id})
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-[#8b9bb4]">所属区域</span>
                          <span className="text-[#e8f1ff]">
                            {displayText(selectedAlert.forest_zone || selectedAlert.region)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-[#8b9bb4]">GPS坐标</span>
                          <span className="text-[#e8f1ff] font-mono">
                            {displayText(selectedAlert.latitude)}, {displayText(selectedAlert.longitude)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-[#8b9bb4]">触发时间</span>
                          <span className="text-[#e8f1ff] font-mono">
                            {formatTime(selectedAlert.occurred_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                      <div className="text-[10px] text-[#8b9bb4] mb-2">AI分析 / 状态</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="text-[#8b9bb4]">AI置信度</span>
                          <span
                            className={`font-mono ${
                              confidencePercent(selectedAlert.ai_confidence) >= 85
                                ? 'text-[#ef4444]'
                                : 'text-[#f59e0b]'
                            }`}
                          >
                            {confidencePercent(selectedAlert.ai_confidence) || '--'}
                            {selectedAlert.ai_confidence != null ? '%' : ''}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-[#8b9bb4]">AI类别</span>
                          <span className="text-[#e8f1ff]">{displayText(selectedAlert.ai_category)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-[#8b9bb4]">当前状态</span>
                          <span className={statusConfig[selectedAlert.status]?.color || 'text-[#e8f1ff]'}>
                            {selectedAlert.status_display ||
                              statusConfig[selectedAlert.status]?.label ||
                              selectedAlert.status}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-[#8b9bb4]">指派给</span>
                          <span className="text-[#e8f1ff]">{displayText(selectedAlert.assigned_to)}</span>
                        </div>
                        {(selectedAlert.work_orders?.length ?? 0) > 0 && (
                          <div className="flex justify-between gap-2">
                            <span className="text-[#8b9bb4]">关联工单</span>
                            <div className="text-right space-y-0.5">
                              {selectedAlert.work_orders?.slice(0, 3).map((wo) => (
                                <div key={wo.id}>
                                  <Link
                                    href="/alerts/work-orders"
                                    className="text-[#3b82f6] font-mono hover:underline"
                                  >
                                    {wo.work_order_id}
                                  </Link>
                                  <span className="text-[#8b9bb4] ml-1">
                                    ({wo.status_display || wo.status})
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex justify-between gap-3">
                          <span className="text-[#8b9bb4]">处置说明</span>
                          <span className="text-[#e8f1ff] text-right">
                            {displayText(selectedAlert.resolution_note)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                    <div className="text-[10px] text-[#8b9bb4] mb-2">告警描述</div>
                    <p className="text-sm text-[#e8f1ff] leading-relaxed">
                      {displayText(selectedAlert.description) === '-'
                        ? '暂无描述'
                        : selectedAlert.description}
                    </p>
                  </div>

                  {(selectedAlert.screenshot_url || selectedAlert.thermal_image_url) && (
                    <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                      <div className="text-[10px] text-[#8b9bb4] mb-2">现场影像</div>
                      <div className="grid grid-cols-2 gap-3">
                        {selectedAlert.screenshot_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selectedAlert.screenshot_url}
                            alt="告警截图"
                            className="w-full aspect-video object-cover rounded bg-[#0a1628]"
                          />
                        )}
                        {selectedAlert.thermal_image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selectedAlert.thermal_image_url}
                            alt="热成像"
                            className="w-full aspect-video object-cover rounded bg-[#0a1628]"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {selectedAlert.fire_tracing && (
                    <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                      <div className="text-[10px] text-[#8b9bb4] mb-2">火情溯源</div>
                      <div className="space-y-1 text-sm text-[#e8f1ff]">
                        <div>算法：{displayText(selectedAlert.fire_tracing.algorithm)}</div>
                        <div>
                          起火点：{displayText(selectedAlert.fire_tracing.origin_latitude)},{' '}
                          {displayText(selectedAlert.fire_tracing.origin_longitude)}
                        </div>
                        <div>
                          6h 预测：
                          {selectedAlert.fire_tracing.spread_prediction_6h?.area_km2 != null
                            ? `${(Number(selectedAlert.fire_tracing.spread_prediction_6h.area_km2) * 100).toFixed(1)}公顷`
                            : '-'}
                        </div>
                        <button
                          type="button"
                          onClick={() => router.push('/fire-tracing')}
                          className="mt-1 text-[11px] text-[#3b82f6] hover:underline"
                        >
                          查看完整溯源 →
                        </button>
                      </div>
                    </div>
                  )}

                  {actionMessage && (
                    <div className="p-3 bg-[#3b82f6]/10 border border-[#3b82f6]/30 rounded text-sm text-[#93c5fd]">
                      {actionMessage}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    {canAccept && (
                      <button
                        disabled={actionLoading}
                        onClick={() => void openDispatchDialog()}
                        className="px-3 py-1.5 text-sm bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] disabled:opacity-50"
                      >
                        派单生成工单
                      </button>
                    )}
                    {canProcess && (
                      <button
                        disabled={actionLoading}
                        onClick={() => void runAction(() => startProcessingAlert(selectedAlert.id))}
                        className="px-3 py-1.5 text-sm bg-[#06b6d4] text-white rounded hover:bg-[#0891b2] disabled:opacity-50"
                      >
                        开始处置
                      </button>
                    )}
                    {canResolve && (
                      <>
                        <button
                          disabled={actionLoading}
                          onClick={() =>
                            void runAction(() =>
                              resolveAlert(selectedAlert.id, {
                                status: 'resolved',
                                note: '现场已控制',
                              })
                            )
                          }
                          className="px-3 py-1.5 text-sm bg-[#10b981] text-white rounded hover:bg-[#059669] disabled:opacity-50"
                        >
                          标记已控制
                        </button>
                        <button
                          disabled={actionLoading}
                          onClick={() =>
                            void runAction(() =>
                              resolveAlert(selectedAlert.id, {
                                status: 'false_alarm',
                                note: '确认为误报',
                              })
                            )
                          }
                          className="px-3 py-1.5 text-sm border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] disabled:opacity-50"
                        >
                          上报误报
                        </button>
                      </>
                    )}
                    {canEscalate && (
                      <button
                        disabled={actionLoading}
                        onClick={() => void runAction(() => escalateAlert(selectedAlert.id))}
                        className="px-3 py-1.5 text-sm border border-[#ef4444]/40 text-[#ef4444] rounded hover:bg-[#ef4444]/10 disabled:opacity-50"
                      >
                        升级告警
                      </button>
                    )}
                    {canFireTrace && (
                      <button
                        disabled={actionLoading}
                        onClick={() => void runAction(() => startFireTracing(selectedAlert.id))}
                        className="px-3 py-1.5 text-sm border border-[#f59e0b]/40 text-[#f59e0b] rounded hover:bg-[#f59e0b]/10 disabled:opacity-50"
                      >
                        启动火情溯源
                      </button>
                    )}
                    {canAim && (
                      <button
                        disabled={actionLoading}
                        onClick={() => void handleAimAlert()}
                        className="px-3 py-1.5 text-sm border border-[#06b6d4]/40 text-[#06b6d4] rounded hover:bg-[#06b6d4]/10 disabled:opacity-50"
                      >
                        云台对准告警
                      </button>
                    )}
                    {canReinforce && (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => setShowReinforce(true)}
                        className="px-3 py-1.5 text-sm border border-[#f59e0b]/30 text-[#f59e0b] rounded hover:bg-[#f59e0b]/10 disabled:opacity-50"
                      >
                        请求增援
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => void handleNavigate()}
                      className="px-3 py-1.5 text-sm border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] disabled:opacity-50"
                    >
                      导航至火点
                    </button>
                    <button
                      onClick={() => void loadActions()}
                      className="px-3 py-1.5 text-sm border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] ml-auto"
                    >
                      查看处置记录
                    </button>
                  </div>

                  {showDispatch && (
                    <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3 space-y-2">
                      <div className="text-[10px] text-[#8b9bb4]">派单并生成工单</div>
                      <label className="inline-flex items-center gap-1.5 text-sm text-[#e8f1ff]">
                        <input
                          type="checkbox"
                          checked={dispatchSelf}
                          onChange={(e) => {
                            setDispatchSelf(e.target.checked);
                            if (e.target.checked) setAssigneeId('');
                          }}
                        />
                        自己接单处置
                      </label>
                      {!dispatchSelf && (
                        <>
                          <input
                            className="w-full bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-sm text-[#e8f1ff]"
                            placeholder="搜索用户名/姓名/部门"
                            value={assigneeSearch}
                            onChange={(e) => setAssigneeSearch(e.target.value)}
                          />
                          <select
                            className="w-full bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-sm text-[#e8f1ff]"
                            value={assigneeId === '' ? '' : String(assigneeId)}
                            onChange={(e) =>
                              setAssigneeId(e.target.value ? Number(e.target.value) : '')
                            }
                            disabled={assigneeLoading}
                          >
                            <option value="">
                              {assigneeLoading ? '加载用户中…' : '选择处理人'}
                            </option>
                            {filteredAssignees.map((u) => {
                              const name =
                                `${u.last_name || ''}${u.first_name || ''}`.trim() ||
                                u.full_name ||
                                u.username;
                              return (
                                <option key={u.id} value={u.id}>
                                  {name}（{u.username}
                                  {u.department ? ` · ${u.department}` : ''}）
                                </option>
                              );
                            })}
                          </select>
                        </>
                      )}
                      <textarea
                        className="w-full bg-[#152238] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
                        rows={2}
                        placeholder="派单说明（可选）"
                        value={dispatchNote}
                        onChange={(e) => setDispatchNote(e.target.value)}
                      />
                      <div className="flex gap-2 items-center">
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => void handleDispatch()}
                          className="px-3 py-1.5 text-sm bg-[#3b82f6] text-white rounded disabled:opacity-50"
                        >
                          确认派单
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowDispatch(false)}
                          className="px-3 py-1.5 text-sm border border-[#1e3a5f] text-[#8b9bb4] rounded"
                        >
                          取消
                        </button>
                        <Link
                          href="/alerts/work-orders"
                          className="ml-auto text-[11px] text-[#3b82f6] hover:underline"
                        >
                          查看工单 →
                        </Link>
                      </div>
                    </div>
                  )}

                  {showReinforce && (
                    <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3 space-y-2">
                      <div className="text-[10px] text-[#8b9bb4]">请求增援</div>
                      <textarea
                        className="w-full bg-[#152238] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
                        rows={2}
                        placeholder="请说明增援事由..."
                        value={reinforceReason}
                        onChange={(e) => setReinforceReason(e.target.value)}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-sm text-[#e8f1ff]"
                          placeholder="联系方式"
                          value={reinforceContact}
                          onChange={(e) => setReinforceContact(e.target.value)}
                        />
                        <input
                          type="number"
                          min={1}
                          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-sm text-[#e8f1ff]"
                          value={reinforcePeople}
                          onChange={(e) => setReinforcePeople(parseInt(e.target.value, 10) || 1)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => void handleReinforce()}
                          className="px-3 py-1.5 text-sm bg-[#f59e0b] text-white rounded disabled:opacity-50"
                        >
                          提交申请
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowReinforce(false)}
                          className="px-3 py-1.5 text-sm border border-[#1e3a5f] text-[#8b9bb4] rounded"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}

                  {showActions && (
                    <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                      <div className="text-[10px] text-[#8b9bb4] mb-2">处置记录</div>
                      {actionsLoading ? (
                        <p className="text-sm text-[#8b9bb4]">加载中...</p>
                      ) : actions.length === 0 ? (
                        <p className="text-sm text-[#8b9bb4]">暂无处置记录</p>
                      ) : (
                        <ul className="space-y-2 max-h-48 overflow-auto">
                          {actions.map((a) => (
                            <li
                              key={a.id}
                              className="text-sm border-b border-[#1e3a5f]/50 pb-2 last:border-0"
                            >
                              <div className="flex justify-between gap-2">
                                <span className="text-[#3b82f6]">{a.action_type}</span>
                                <span className="text-[#8b9bb4] font-mono">{formatTime(a.created_at)}</span>
                              </div>
                              <div className="text-[#e8f1ff] mt-0.5">
                                {a.operator}：{a.content || '-'}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AlertsPage() {
  return (
    <AuthGuard>
      <AlertsPageContent />
    </AuthGuard>
  );
}
