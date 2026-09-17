'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getDevices,
  getDevice,
  getDeviceEffectiveRules,
  deleteDevice,
  batchDeleteDevices,
  batchUpdateDeviceStatus,
  batchRestartDevices,
  type Device,
} from '@/lib/api/devices';
import Pagination, { usePagination } from '@/components/ui/pagination';
import ConfirmDeleteDialog from '@/components/ui/confirm-delete-dialog';
import DeviceFormDialog from '@/components/devices/device-form-dialog';
import DeviceControlPanel from '@/components/devices/device-control-panel';
import CommandAuditPanel from '@/components/devices/command-audit-panel';
import { AuthGuard } from '@/components/auth-guard';
import { useRegionFilter } from '@/contexts/RegionFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

const typeLabels: Record<string, string> = {
  dual_camera: '双目智能监测云台',
  env_sensor: '多参数环境传感器',
  ai_gateway: 'AI边缘网关',
  drone: '无人机',
};

const statusLabels: Record<string, { text: string; color: string }> = {
  online: { text: '在线', color: 'text-[#10b981]' },
  offline: { text: '离线', color: 'text-[#8b9bb4]' },
  alarm: { text: '告警', color: 'text-[#ef4444]' },
  maintenance: { text: '维护中', color: 'text-[#f59e0b]' },
};

const commLabels: Record<string, string> = {
  '4g': '4G',
  lora: 'LoRa',
  wifi: 'WiFi',
  ethernet: '有线',
};

function displayValue(value: string | number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined || value === '') return '-';
  return `${value}${suffix}`;
}

function DevicesPageContent() {
  const { user: currentUser } = useAuth();
  const canControl =
    !!currentUser &&
    (currentUser.is_superuser === true ||
      currentUser.is_staff === true ||
      currentUser.role === 'admin' ||
      currentUser.role === 'operator' ||
      currentUser.role === 'forester');
  const [devices, setDevices] = useState<Device[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { region, area } = useRegionFilter();
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState('');
  const [batchStatus, setBatchStatus] = useState('maintenance');
  const [effectiveRules, setEffectiveRules] = useState<
    Array<{
      id: number;
      name: string;
      alert_level: string;
      alert_level_display?: string;
      apply_scope_display?: string;
      apply_scope?: string;
      region?: string;
      is_enabled: boolean;
    }>
  >([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteForce, setDeleteForce] = useState(false);
  const { current, pageSize, onPageChange, onPageSizeChange } = usePagination(10);

  const pageIds = useMemo(() => devices.map((d) => d.id), [devices]);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = pageIds.some((id) => selectedIds.includes(id));

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getDevices({
        page: current,
        page_size: pageSize,
        search: search || undefined,
        device_type: typeFilter || undefined,
        status: statusFilter || undefined,
        forest_zone: region || undefined,
        region: area || undefined,
      });
      setDevices(response.results);
      setTotalCount(response.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取设备列表失败');
    } finally {
      setLoading(false);
    }
  }, [current, pageSize, search, typeFilter, statusFilter, region, area]);

  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    // 仅在筛选条件变化时回到第 1 页，勿把 current 放入依赖（否则翻页会被打回）
    onPageChange(1);
  }, [search, region, area, typeFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedIds([]);
  }, [current, pageSize, search, region, area, typeFilter, statusFilter]);

  const toggleBatchMode = () => {
    setBatchMode((prev) => {
      if (prev) {
        setSelectedIds([]);
        setBatchMessage('');
      }
      return !prev;
    });
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPage = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const runBatch = async (action: () => Promise<string>) => {
    if (selectedIds.length === 0) {
      setBatchMessage('请先勾选设备');
      return;
    }
    setBatchBusy(true);
    setBatchMessage('');
    try {
      const msg = await action();
      setBatchMessage(msg);
      setSelectedIds([]);
      await fetchDevices();
    } catch (err) {
      setBatchMessage(err instanceof Error ? err.message : '批量操作失败');
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBatchDelete = () => {
    if (!window.confirm(`确认删除选中的 ${selectedIds.length} 台设备？`)) return;
    const forceDelete = window.confirm(
      '是否强制删除？\n确定=强制删除（含关联遥测/指令）\n取消=普通删除（有关联数据则跳过）'
    );
    void runBatch(async () => {
      const res = await batchDeleteDevices(selectedIds, forceDelete);
      const errHint =
        res.errors.length > 0 ? `；跳过/失败 ${res.errors.length} 台` : '';
      return `已删除 ${res.deleted_count}/${res.total} 台${errHint}`;
    });
  };

  const handleBatchStatus = () => {
    if (!window.confirm(`将选中的 ${selectedIds.length} 台设备状态设为「${statusLabels[batchStatus]?.text || batchStatus}」？`)) {
      return;
    }
    void runBatch(async () => {
      const res = await batchUpdateDeviceStatus(selectedIds, batchStatus);
      return res.message || `已更新 ${res.updated_count} 台`;
    });
  };

  const handleBatchRestart = () => {
    if (!window.confirm(`向选中的 ${selectedIds.length} 台设备发送重启指令？`)) {
      return;
    }
    void runBatch(async () => {
      const res = await batchRestartDevices(selectedIds);
      const errHint =
        res.errors.length > 0 ? `；失败 ${res.errors.length} 台` : '';
      return `${res.message || `已发送 ${res.sent_count} 台`}${errHint}`;
    });
  };

  const openDetail = async (device: Device) => {
    setSelectedDevice(device);
    setDetailLoading(true);
    setDetailError('');
    setEffectiveRules([]);
    setRulesLoading(true);
    try {
      // 列表接口字段不全，详情走 GET /api/devices/devices/:id/
      const full = await getDevice(device.id);
      setSelectedDevice(full);
      try {
        const rulesRes = await getDeviceEffectiveRules(device.id);
        setEffectiveRules(rulesRes.results);
      } catch {
        setEffectiveRules([]);
      }
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : '获取设备详情失败');
    } finally {
      setDetailLoading(false);
      setRulesLoading(false);
    }
  };

  const openEdit = async (device: Device) => {
    try {
      const full = await getDevice(device.id);
      setEditingDevice(full);
    } catch {
      setEditingDevice(device);
    }
  };

  const askDelete = (device: Device) => {
    setDeleting(device);
    setDeleteError('');
    setDeleteForce(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await deleteDevice(deleting.id, deleteForce);
      if (selectedDevice?.id === deleting.id) {
        setSelectedDevice(null);
      }
      setSelectedIds((ids) => ids.filter((id) => id !== deleting.id));
      setDeleting(null);
      setDeleteForce(false);
      await fetchDevices();
    } catch (err) {
      const conflict =
        err instanceof Error &&
        'conflict' in err &&
        (err as Error & { conflict?: boolean }).conflict === true;
      if (conflict && !deleteForce) {
        setDeleteForce(true);
        setDeleteError(
          `${err instanceof Error ? err.message : '存在关联数据'}。再次确认将强制删除（含遥测/指令）。`
        );
      } else {
        setDeleteError(err instanceof Error ? err.message : '删除失败');
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const formatTime = (dateString?: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const closeDetail = () => {
    setSelectedDevice(null);
    setDetailError('');
    setEffectiveRules([]);
    setRulesLoading(false);
  };

  const levelColor = (level: string) => {
    if (level === 'critical') return 'text-[#ef4444]';
    if (level === 'warning') return 'text-[#f59e0b]';
    return 'text-[#3b82f6]';
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-[#e8f1ff]">设备管理</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAddDialog(true)}
            className="px-3 py-1.5 text-sm bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors"
          >
            + 添加设备
          </button>
          <button
            type="button"
            onClick={toggleBatchMode}
            className={`px-3 py-1.5 text-sm rounded border transition-colors ${
              batchMode
                ? 'border-[#3b82f6] bg-[#3b82f6]/15 text-[#3b82f6]'
                : 'border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6]'
            }`}
          >
            {batchMode ? '退出批量' : '批量操作'}
          </button>
        </div>
      </div>

      {canControl && <CommandAuditPanel />}

      {batchMode && (
        <div className="flex flex-wrap items-center gap-2 bg-[#152238] border border-[#1e3a5f] rounded-lg px-3 py-2">
          <span className="text-sm text-[#8b9bb4]">
            已选 <span className="text-[#e8f1ff] font-mono">{selectedIds.length}</span> 台
          </span>
          <select
            value={batchStatus}
            onChange={(e) => setBatchStatus(e.target.value)}
            disabled={batchBusy}
            className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1 text-sm text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] disabled:opacity-50"
          >
            <option value="online">设为在线</option>
            <option value="offline">设为离线</option>
            <option value="alarm">设为告警</option>
            <option value="maintenance">设为维护中</option>
          </select>
          <button
            type="button"
            disabled={batchBusy || selectedIds.length === 0}
            onClick={handleBatchStatus}
            className="px-2.5 py-1 text-sm rounded border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6] disabled:opacity-40"
          >
            应用状态
          </button>
          <button
            type="button"
            disabled={batchBusy || selectedIds.length === 0}
            onClick={handleBatchRestart}
            className="px-2.5 py-1 text-sm rounded border border-[#1e3a5f] text-[#f59e0b] hover:border-[#f59e0b] disabled:opacity-40"
          >
            批量重启
          </button>
          <button
            type="button"
            disabled={batchBusy || selectedIds.length === 0}
            onClick={handleBatchDelete}
            className="px-2.5 py-1 text-sm rounded border border-[#ef4444]/40 text-[#ef4444] hover:border-[#ef4444] disabled:opacity-40"
          >
            批量删除
          </button>
          {batchBusy && <span className="text-[10px] text-[#8b9bb4]">处理中…</span>}
          {batchMessage && (
            <span className="text-[11px] text-[#3b82f6] max-w-full truncate">{batchMessage}</span>
          )}
        </div>
      )}

      <DeviceFormDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSuccess={() => {
          void fetchDevices();
        }}
      />

      <DeviceFormDialog
        open={!!editingDevice}
        device={editingDevice}
        onClose={() => setEditingDevice(null)}
        onSuccess={() => {
          void fetchDevices();
          if (selectedDevice && editingDevice && selectedDevice.id === editingDevice.id) {
            void openDetail(editingDevice);
          }
        }}
      />

      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="搜索设备名称或ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6] w-64"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-sm text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
        >
          <option value="">全部类型</option>
          <option value="dual_camera">双目智能监测云台</option>
          <option value="env_sensor">多参数环境传感器</option>
          <option value="ai_gateway">AI边缘网关</option>
          <option value="drone">无人机</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-sm text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
        >
          <option value="">全部状态</option>
          <option value="online">在线</option>
          <option value="offline">离线</option>
          <option value="alarm">告警</option>
          <option value="maintenance">维护中</option>
        </select>
        <span className="text-sm text-[#8b9bb4] ml-auto">
          共 <span className="text-[#e8f1ff] font-mono">{totalCount}</span> 台设备
        </span>
      </div>

      <div className="flex-1 bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-[#8b9bb4]">加载中...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-sm text-[#ef4444] mb-2">{error}</p>
                <button
                  onClick={() => void fetchDevices()}
                  className="px-3 py-1.5 text-sm bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors"
                >
                  重试
                </button>
              </div>
            </div>
          ) : devices.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <svg className="w-16 h-16 text-[#1e3a5f] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2a4 4 0 014-4h4m-4-4h.01M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h8l4 4z" />
                </svg>
                <p className="text-sm text-[#8b9bb4]">暂无设备数据</p>
                <button
                  onClick={() => setShowAddDialog(true)}
                  className="mt-3 px-3 py-1.5 text-sm bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors"
                >
                  添加第一台设备
                </button>
              </div>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-[#0f1e35] sticky top-0">
                <tr>
                  {batchMode && (
                    <th className="text-left px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = somePageSelected && !allPageSelected;
                        }}
                        onChange={toggleSelectAllPage}
                        aria-label="全选本页"
                        className="accent-[#3b82f6]"
                      />
                    </th>
                  )}
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">设备ID</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">设备名称</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">类型</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">状态</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">信号</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">电量</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">所属林区</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">最后在线</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">操作</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr
                    key={device.id}
                    className={`border-t border-[#1e3a5f]/50 hover:bg-[#1a2d4a] transition-colors ${
                      selectedIds.includes(device.id) ? 'bg-[#1a2d4a]/70' : ''
                    }`}
                  >
                    {batchMode && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(device.id)}
                          onChange={() => toggleSelect(device.id)}
                          aria-label={`选择 ${device.device_id}`}
                          className="accent-[#3b82f6]"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-[#e8f1ff] font-mono">{device.device_id}</td>
                    <td className="px-4 py-3 text-sm text-[#e8f1ff]">{device.device_name}</td>
                    <td className="px-4 py-3 text-sm text-[#8b9bb4]">{device.device_type_display || typeLabels[device.device_type]}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm ${statusLabels[device.status]?.color || 'text-[#8b9bb4]'}`}>
                        {device.status === 'alarm' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#ef4444] mr-1 animate-pulse" />}
                        {device.status_display || statusLabels[device.status]?.text || device.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }, (_, i) => (
                          <div
                            key={i}
                            className={`w-1 h-3 rounded-sm ${i < (device.signal_strength || 0) ? 'bg-[#10b981]' : 'bg-[#1e3a5f]'}`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {device.battery_level !== null && device.battery_level !== undefined ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[#0f1e35] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                device.battery_level > 50 ? 'bg-[#10b981]' : device.battery_level > 20 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]'
                              }`}
                              style={{ width: `${device.battery_level}%` }}
                            />
                          </div>
                          <span className="text-sm text-[#8b9bb4] font-mono">{device.battery_level}%</span>
                        </div>
                      ) : (
                        <span className="text-sm text-[#8b9bb4]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#8b9bb4]">
                      {device.forest_zone_ref_name || device.forest_zone || device.region || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#8b9bb4] font-mono">{formatTime(device.last_online_time)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => void openDetail(device)}
                          className="text-sm text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
                        >
                          详情
                        </button>
                        <button
                          onClick={() => void openEdit(device)}
                          className="text-sm text-[#10b981] hover:text-[#34d399] transition-colors"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => askDelete(device)}
                          className="text-sm text-[#ef4444] hover:text-[#f87171] transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

      {selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeDetail}>
          <div
            className="bg-[#152238] border border-[#1e3a5f] rounded-lg w-[640px] max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e3a5f]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[#e8f1ff]">设备详情</span>
                <span className="text-sm text-[#8b9bb4] font-mono">[{selectedDevice.device_id}]</span>
              </div>
              <button onClick={closeDetail} className="text-[#8b9bb4] hover:text-[#e8f1ff]">
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-10 h-10 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : detailError ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[#ef4444] mb-3">{detailError}</p>
                  <button
                    onClick={() => void openDetail(selectedDevice)}
                    className="px-3 py-1.5 text-sm bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors"
                  >
                    重试
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                      <div className="text-[10px] text-[#8b9bb4] mb-2">基本信息</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-[#8b9bb4] shrink-0">设备名称</span>
                          <span className="text-[#e8f1ff] text-right">{displayValue(selectedDevice.device_name)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[#8b9bb4] shrink-0">设备类型</span>
                          <span className="text-[#e8f1ff] text-right">
                            {selectedDevice.device_type_display || typeLabels[selectedDevice.device_type] || '-'}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[#8b9bb4] shrink-0">所属区域</span>
                          <span className="text-[#e8f1ff] text-right">{displayValue(selectedDevice.region)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[#8b9bb4] shrink-0">所属林区</span>
                          <span className="text-[#e8f1ff] text-right">{displayValue(selectedDevice.forest_zone)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[#8b9bb4] shrink-0">GPS坐标</span>
                          <span className="text-[#e8f1ff] font-mono text-right">
                            {displayValue(selectedDevice.latitude)}, {displayValue(selectedDevice.longitude)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[#8b9bb4] shrink-0">海拔</span>
                          <span className="text-[#e8f1ff] font-mono text-right">
                            {displayValue(selectedDevice.altitude, ' m')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                      <div className="text-[10px] text-[#8b9bb4] mb-2">运行状态</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-[#8b9bb4] shrink-0">在线状态</span>
                          <span className={statusLabels[selectedDevice.status]?.color || 'text-[#e8f1ff]'}>
                            {selectedDevice.status_display || statusLabels[selectedDevice.status]?.text || '-'}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[#8b9bb4] shrink-0">通信方式</span>
                          <span className="text-[#e8f1ff] text-right">
                            {selectedDevice.communication_type_display ||
                              (selectedDevice.communication_type
                                ? commLabels[selectedDevice.communication_type] || selectedDevice.communication_type
                                : '-')}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[#8b9bb4] shrink-0">信号强度</span>
                          <span className="text-[#e8f1ff] font-mono text-right">
                            {selectedDevice.signal_strength ?? 0}/5
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[#8b9bb4] shrink-0">电池电量</span>
                          <span className="text-[#e8f1ff] font-mono text-right">
                            {selectedDevice.battery_level !== null && selectedDevice.battery_level !== undefined
                              ? `${selectedDevice.battery_level}%`
                              : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[#8b9bb4] shrink-0">最后在线</span>
                          <span className="text-[#e8f1ff] font-mono text-right">
                            {formatTime(selectedDevice.last_online_time)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[#8b9bb4] shrink-0">最后心跳</span>
                          <span className="text-[#e8f1ff] font-mono text-right">
                            {formatTime(selectedDevice.last_heartbeat)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedDevice.device_type === 'dual_camera' && (
                    <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                      <div className="text-[10px] text-[#8b9bb4] mb-2">云台参数</div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-[#8b9bb4]">水平角</span>
                          <span className="text-[#e8f1ff] font-mono">
                            {displayValue(selectedDevice.pan_angle, '°')}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[#8b9bb4]">垂直角</span>
                          <span className="text-[#e8f1ff] font-mono">
                            {displayValue(selectedDevice.tilt_angle, '°')}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                    <div className="text-[10px] text-[#8b9bb4] mb-2">设备属性</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <div className="flex justify-between gap-2 sm:flex-col sm:gap-1">
                        <span className="text-[#8b9bb4]">固件版本</span>
                        <span className="text-[#e8f1ff]">{displayValue(selectedDevice.firmware_version)}</span>
                      </div>
                      <div className="flex justify-between gap-2 sm:flex-col sm:gap-1">
                        <span className="text-[#8b9bb4]">硬件版本</span>
                        <span className="text-[#e8f1ff]">{displayValue(selectedDevice.hardware_version)}</span>
                      </div>
                      <div className="flex justify-between gap-2 sm:flex-col sm:gap-1">
                        <span className="text-[#8b9bb4]">厂商</span>
                        <span className="text-[#e8f1ff]">{displayValue(selectedDevice.manufacturer)}</span>
                      </div>
                      <div className="flex justify-between gap-2 sm:flex-col sm:gap-1">
                        <span className="text-[#8b9bb4]">安装日期</span>
                        <span className="text-[#e8f1ff] font-mono">{displayValue(selectedDevice.install_date)}</span>
                      </div>
                      <div className="flex justify-between gap-2 sm:flex-col sm:gap-1">
                        <span className="text-[#8b9bb4]">上次维护</span>
                        <span className="text-[#e8f1ff] font-mono">{displayValue(selectedDevice.last_maintenance)}</span>
                      </div>
                      <div className="flex justify-between gap-2 sm:flex-col sm:gap-1">
                        <span className="text-[#8b9bb4]">创建时间</span>
                        <span className="text-[#e8f1ff] font-mono">{formatTime(selectedDevice.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] text-[#8b9bb4]">生效告警规则（只读）</div>
                      <Link
                        href="/rules/alert-rules"
                        className="text-[10px] text-[#3b82f6] hover:text-[#60a5fa]"
                        onClick={closeDetail}
                      >
                        去规则引擎配置 →
                      </Link>
                    </div>
                    {rulesLoading ? (
                      <div className="text-sm text-[#8b9bb4] py-2">加载规则中…</div>
                    ) : effectiveRules.length === 0 ? (
                      <div className="text-sm text-[#8b9bb4] py-2">暂无对该设备生效的告警规则</div>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-auto">
                        {effectiveRules.map((rule) => (
                          <div
                            key={rule.id}
                            className="flex items-center justify-between gap-3 text-sm border border-[#1e3a5f]/60 rounded px-2 py-1.5"
                          >
                            <div className="min-w-0">
                              <div className="text-[#e8f1ff] truncate">{rule.name}</div>
                              <div className="text-[10px] text-[#8b9bb4] mt-0.5">
                                {rule.apply_scope_display || rule.apply_scope || '-'}
                                {rule.region ? ` · ${rule.region}` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={levelColor(rule.alert_level)}>
                                {rule.alert_level_display || rule.alert_level}
                              </span>
                              <span
                                className={
                                  rule.is_enabled ? 'text-[#10b981]' : 'text-[#8b9bb4]'
                                }
                              >
                                {rule.is_enabled ? '启用' : '停用'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-1">
                    <DeviceControlPanel
                      device={selectedDevice}
                      canControl={canControl}
                      onPoseChange={(p, t) => {
                        setSelectedDevice((prev) =>
                          prev
                            ? {
                                ...prev,
                                pan_angle: p ?? prev.pan_angle,
                                tilt_angle: t ?? prev.tilt_angle,
                              }
                            : prev
                        );
                      }}
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => void openEdit(selectedDevice)}
                      className="px-3 py-1.5 text-sm bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors"
                    >
                      编辑设备
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!deleting}
        title={deleteForce ? '强制删除设备' : '删除设备'}
        targetName={
          deleting ? `${deleting.device_name}（${deleting.device_id}）` : ''
        }
        loading={deleteLoading}
        error={deleteError}
        onCancel={() => {
          if (!deleteLoading) {
            setDeleting(null);
            setDeleteError('');
            setDeleteForce(false);
          }
        }}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  );
}

export default function DevicesPage() {
  return (
    <AuthGuard>
      <DevicesPageContent />
    </AuthGuard>
  );
}
