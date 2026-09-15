'use client';

import { useState, useEffect, FormEvent } from 'react';
import {
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
} from '@/lib/api/alerts';
import { getDevices, type Device } from '@/lib/api/devices';
import { getForestZoneOptions, type ForestZoneOption } from '@/lib/api/organization';
import { useRegionFilter } from '@/contexts/RegionFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import type { AlertRule, PushChannel, RuleApplyScope } from '@/types/alert';
import ConfirmDeleteDialog from '@/components/ui/confirm-delete-dialog';

const levelColors: Record<string, string> = {
  level_1: '#ef4444',
  level_2: '#f59e0b',
  level_3: '#3b82f6',
};

const VIEW_MODE_KEY = 'alert_rules_view_mode';
type ViewMode = 'card' | 'list';

const channelOptions: { value: PushChannel; label: string }[] = [
  { value: 'in_app', label: '站内信' },
  { value: 'sms', label: '短信' },
  { value: 'voice', label: '语音' },
  { value: 'dedicated_line', label: '专线' },
  { value: 'email', label: '邮件' },
];

const scopeOptions: { value: RuleApplyScope; label: string; hint: string }[] = [
  { value: 'global', label: '全部设备', hint: '对所有设备生效' },
  { value: 'region', label: '按林区', hint: '仅匹配所选林区设备' },
  { value: 'device_type', label: '按设备类型', hint: '可再叠加林区过滤' },
  { value: 'devices', label: '指定设备', hint: '仅对勾选设备生效' },
];

const deviceTypeOptions = [
  { value: 'dual_camera', label: '双目智能监测云台' },
  { value: 'env_sensor', label: '多参数环境传感器' },
  { value: 'ai_gateway', label: 'AI边缘网关' },
  { value: 'drone', label: '无人机' },
];

const emptyForm = {
  name: '',
  alert_type: 'fire',
  alert_level: 'level_2',
  confidence_threshold: 0.85,
  temperature_threshold: undefined as number | undefined,
  humidity_threshold: undefined as number | undefined,
  push_channels: ['in_app'] as string[],
  response_seconds: 120,
  apply_scope: 'global' as RuleApplyScope,
  region: '',
  forest_zone_ref: null as number | null,
  device_type: '',
  device_ids: [] as number[],
  description: '',
  is_enabled: true,
};

function formatSeconds(sec: number): string {
  if (sec < 60) return `${sec}秒`;
  if (sec % 60 === 0) return `${sec / 60}分钟`;
  return `${Math.floor(sec / 60)}分${sec % 60}秒`;
}

function scopeLabel(rule: AlertRule): string {
  const scope = rule.apply_scope || 'global';
  if (scope === 'global') return '全部设备';
  if (scope === 'region') {
    return `林区：${rule.forest_zone_ref_name || rule.region || '-'}`;
  }
  if (scope === 'device_type') {
    const typeName = rule.device_type_display || rule.device_type || '-';
    return rule.region ? `类型：${typeName} · ${rule.region}` : `类型：${typeName}`;
  }
  if (scope === 'devices') return `指定设备 ${rule.device_count ?? rule.device_ids?.length ?? 0} 台`;
  return rule.apply_scope_display || scope;
}

function channelLabel(channels: string[] | undefined): string {
  if (!channels?.length) return '-';
  return channels
    .map((ch) => channelOptions.find((o) => o.value === ch)?.label || ch)
    .join('、');
}

function readStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'card';
  const v = localStorage.getItem(VIEW_MODE_KEY);
  return v === 'list' ? 'list' : 'card';
}

export default function AlertRulesPanel() {
  const { region: selectedForestZone, area: selectedArea } = useRegionFilter();
  const { user } = useAuth();
  const canManageSystemRules = Boolean(user?.org_scope?.unrestricted || user?.is_superuser);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deviceOptions, setDeviceOptions] = useState<Device[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deleting, setDeleting] = useState<AlertRule | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [forestZones, setForestZones] = useState<ForestZoneOption[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('card');

  useEffect(() => {
    setViewMode(readStoredViewMode());
  }, []);

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getAlertRules({
        page: 1,
        page_size: 100,
        forest_zone: selectedForestZone || undefined,
        region: selectedArea || undefined,
      });
      setRules(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载规则失败');
    } finally {
      setLoading(false);
    }
  };

  const loadDevices = async () => {
    setDeviceLoading(true);
    try {
      const [res, zones] = await Promise.all([
        getDevices({ page: 1, page_size: 200 }),
        getForestZoneOptions(),
      ]);
      setDeviceOptions(res.results);
      setForestZones(zones);
    } catch {
      setDeviceOptions([]);
      setForestZones([]);
    } finally {
      setDeviceLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [selectedForestZone, selectedArea]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadDevices();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDeviceSearch('');
    setCreating(true);
  };

  const openEdit = (rule: AlertRule) => {
    setCreating(false);
    setEditing(rule);
    setDeviceSearch('');
    setForm({
      name: rule.name,
      alert_type: rule.alert_type,
      alert_level: rule.alert_level,
      confidence_threshold: rule.confidence_threshold,
      temperature_threshold: rule.temperature_threshold ?? undefined,
      humidity_threshold: rule.humidity_threshold ?? undefined,
      push_channels: [...(rule.push_channels || [])],
      response_seconds: rule.response_seconds,
      apply_scope: (rule.apply_scope as RuleApplyScope) || 'global',
      region: rule.region || '',
      forest_zone_ref: rule.forest_zone_ref ?? null,
      device_type: rule.device_type || '',
      device_ids: rule.device_ids?.length
        ? [...rule.device_ids]
        : (rule.devices_brief || []).map((d) => d.id),
      description: rule.description || '',
      is_enabled: rule.is_enabled,
    });
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

  const toggleChannel = (ch: string) => {
    setForm((prev) => ({
      ...prev,
      push_channels: prev.push_channels.includes(ch)
        ? prev.push_channels.filter((c) => c !== ch)
        : [...prev.push_channels, ch],
    }));
  };

  const toggleDevice = (id: number) => {
    setForm((prev) => ({
      ...prev,
      device_ids: prev.device_ids.includes(id)
        ? prev.device_ids.filter((x) => x !== id)
        : [...prev.device_ids, id],
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        alert_type: form.alert_type,
        alert_level: form.alert_level,
        confidence_threshold: Number(form.confidence_threshold),
        response_seconds: Number(form.response_seconds),
        temperature_threshold: form.temperature_threshold ?? null,
        humidity_threshold: form.humidity_threshold ?? null,
        push_channels: form.push_channels,
        apply_scope: form.apply_scope,
        region: form.apply_scope === 'global' ? '' : form.region,
        forest_zone_ref:
          form.apply_scope === 'region' || form.apply_scope === 'device_type'
            ? form.forest_zone_ref
            : null,
        device_type: form.apply_scope === 'device_type' ? form.device_type : '',
        device_ids: form.apply_scope === 'devices' ? form.device_ids : [],
        description: form.description,
        is_enabled: form.is_enabled,
      };
      if (editing) {
        await updateAlertRule(editing.id, payload);
      } else {
        await createAlertRule(payload);
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await deleteAlertRule(deleting.id);
      setDeleting(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredDevices = deviceOptions.filter((d) => {
    if (!deviceSearch.trim()) return true;
    const q = deviceSearch.trim().toLowerCase();
    return (
      d.device_id.toLowerCase().includes(q) ||
      d.device_name.toLowerCase().includes(q) ||
      (d.region || '').toLowerCase().includes(q)
    );
  });

  const inputClass =
    'bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-[#e8f1ff]">告警规则配置</h3>
          <p className="text-[10px] text-[#8b9bb4] mt-0.5">
            平台可看全部；下属单位可见系统默认与本组织（含子级）自建规则，平级互不可见
            {selectedForestZone ? (
              <>
                {' · '}筛选：
                <span className="text-[#3b82f6]">{selectedForestZone}</span>
                {selectedArea ? (
                  <>
                    {' / '}
                    <span className="text-[#3b82f6]">{selectedArea}</span>
                  </>
                ) : null}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded border border-[#1e3a5f] overflow-hidden">
            <button
              type="button"
              onClick={() => changeViewMode('card')}
              className={`px-2.5 py-1.5 text-[10px] transition-colors ${
                viewMode === 'card'
                  ? 'bg-[#3b82f6]/20 text-[#3b82f6]'
                  : 'text-[#8b9bb4] hover:text-[#e8f1ff] hover:bg-[#0f1e35]'
              }`}
              title="卡片视图"
            >
              卡片
            </button>
            <button
              type="button"
              onClick={() => changeViewMode('list')}
              className={`px-2.5 py-1.5 text-[10px] border-l border-[#1e3a5f] transition-colors ${
                viewMode === 'list'
                  ? 'bg-[#3b82f6]/20 text-[#3b82f6]'
                  : 'text-[#8b9bb4] hover:text-[#e8f1ff] hover:bg-[#0f1e35]'
              }`}
              title="列表视图"
            >
              列表
            </button>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb]"
          >
            + 新增规则
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2 bg-red-500/10 border border-red-500/40 rounded text-xs text-red-400">{error}</div>
      )}

      {loading ? (
        <p className="text-xs text-[#8b9bb4]">加载中...</p>
      ) : rules.length === 0 ? (
        <p className="text-xs text-[#8b9bb4]">暂无规则，请新增</p>
      ) : viewMode === 'list' ? (
        <div className="border border-[#1e3a5f] rounded overflow-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead className="bg-[#0c1a2e] text-[#8b9bb4]">
              <tr>
                <th className="text-left font-medium px-3 py-2">规则名称</th>
                <th className="text-left font-medium px-3 py-2">所属组织</th>
                <th className="text-left font-medium px-3 py-2">级别</th>
                <th className="text-left font-medium px-3 py-2">类型</th>
                <th className="text-left font-medium px-3 py-2">作用范围</th>
                <th className="text-left font-medium px-3 py-2">响应时限</th>
                <th className="text-left font-medium px-3 py-2">推送</th>
                <th className="text-left font-medium px-3 py-2">状态</th>
                <th className="text-right font-medium px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr
                  key={rule.id}
                  className="border-t border-[#1e3a5f]/60 hover:bg-[#0f1e35]/50"
                >
                  <td className="px-3 py-2.5 text-[#e8f1ff] max-w-[180px]">
                    <div className="truncate font-medium" title={rule.name}>
                      {rule.name}
                      {rule.is_system ? (
                        <span className="ml-1 text-[10px] text-[#f59e0b]">系统</span>
                      ) : null}
                    </div>
                    {rule.description ? (
                      <div className="text-[10px] text-[#8b9bb4] truncate mt-0.5" title={rule.description}>
                        {rule.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-[#8b9bb4] whitespace-nowrap">
                    {rule.is_system ? '系统默认' : rule.organization_name || '-'}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span style={{ color: levelColors[rule.alert_level] || '#e8f1ff' }}>
                      {rule.alert_level_display || rule.alert_level}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#8b9bb4] whitespace-nowrap">
                    {rule.alert_type_display || rule.alert_type}
                  </td>
                  <td className="px-3 py-2.5 text-[#3b82f6] max-w-[160px]">
                    <span className="truncate block" title={scopeLabel(rule)}>
                      {scopeLabel(rule)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#8b9bb4] font-mono whitespace-nowrap">
                    {formatSeconds(rule.response_seconds)}
                  </td>
                  <td className="px-3 py-2.5 text-[#8b9bb4] max-w-[140px]">
                    <span className="truncate block" title={channelLabel(rule.push_channels)}>
                      {channelLabel(rule.push_channels)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={rule.is_enabled ? 'text-[#10b981]' : 'text-[#8b9bb4]'}>
                      {rule.is_enabled ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {(canManageSystemRules || !rule.is_system) && (
                      <button
                        type="button"
                        className="text-[10px] text-[#3b82f6] hover:text-[#60a5fa] mr-3"
                        onClick={() => openEdit(rule)}
                      >
                        编辑
                      </button>
                    )}
                    {!rule.is_system && (
                      <button
                        type="button"
                        className="text-[10px] text-[#ef4444] hover:text-[#f87171]"
                        onClick={() => {
                          setDeleteError('');
                          setDeleting(rule);
                        }}
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-xs font-medium"
                  style={{ color: levelColors[rule.alert_level] || '#e8f1ff' }}
                >
                  {rule.alert_level_display || rule.alert_level} · {rule.name}
                  {rule.is_system ? (
                    <span className="ml-1 text-[10px] text-[#f59e0b]">系统</span>
                  ) : null}
                </span>
                <span className="text-[10px] text-[#8b9bb4]">
                  响应时限: {formatSeconds(rule.response_seconds)}
                  {!rule.is_enabled && ' · 已停用'}
                </span>
              </div>
              <div className="text-[10px] text-[#8b9bb4] mb-1">
                {rule.description ||
                  `类型 ${rule.alert_type_display || rule.alert_type} / 置信度 ≥ ${Math.round(rule.confidence_threshold * 100)}%`}
              </div>
              <div className="text-[10px] text-[#8b9bb4] mb-1">
                所属：{rule.is_system ? '系统默认' : rule.organization_name || '-'}
              </div>
              <div className="text-[10px] text-[#3b82f6] mb-1">作用范围：{scopeLabel(rule)}</div>
              <div className="text-[10px] text-[#8b9bb4] mb-2">
                推送：{channelLabel(rule.push_channels)}
              </div>
              <div className="flex gap-3">
                {(canManageSystemRules || !rule.is_system) && (
                  <button
                    type="button"
                    className="text-[10px] text-[#3b82f6] hover:text-[#60a5fa]"
                    onClick={() => openEdit(rule)}
                  >
                    编辑规则
                  </button>
                )}
                {!rule.is_system && (
                  <button
                    type="button"
                    className="text-[10px] text-[#ef4444] hover:text-[#f87171]"
                    onClick={() => {
                      setDeleteError('');
                      setDeleting(rule);
                    }}
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!deleting}
        title="删除告警规则"
        targetName={deleting?.name || ''}
        loading={deleteLoading}
        error={deleteError}
        onCancel={() => {
          if (!deleteLoading) {
            setDeleting(null);
            setDeleteError('');
          }
        }}
        onConfirm={() => void handleDeleteConfirm()}
      />

      {(creating || editing) && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={closeForm} />
          <form
            onSubmit={handleSubmit}
            className="relative bg-[#152238] border border-[#1e3a5f] rounded-lg w-full max-w-xl p-5 space-y-3 max-h-[90vh] overflow-auto"
          >
            <h4 className="text-sm text-[#e8f1ff] font-medium">
              {editing ? '编辑告警规则' : '新增告警规则'}
            </h4>
            <div>
              <label className="text-[10px] text-[#8b9bb4]">规则名称</label>
              <input
                required
                className={`w-full mt-1 ${inputClass}`}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[#8b9bb4]">告警类型</label>
                <select
                  className={`w-full mt-1 ${inputClass}`}
                  value={form.alert_type}
                  onChange={(e) => setForm({ ...form, alert_type: e.target.value })}
                >
                  <option value="fire">火情</option>
                  <option value="smoke">烟雾</option>
                  <option value="high_temp">高温</option>
                  <option value="device_fault">设备故障</option>
                  <option value="low_battery">低电量</option>
                  <option value="offline">离线</option>
                  <option value="env_threshold">环境阈值</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[#8b9bb4]">告警级别</label>
                <select
                  className={`w-full mt-1 ${inputClass}`}
                  value={form.alert_level}
                  onChange={(e) => setForm({ ...form, alert_level: e.target.value })}
                >
                  <option value="level_1">一级(紧急)</option>
                  <option value="level_2">二级(预警)</option>
                  <option value="level_3">三级(提示)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[#8b9bb4]">
                  AI置信度阈值 ({Math.round(form.confidence_threshold * 100)}%)
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={0.99}
                  step={0.01}
                  className="w-full mt-2"
                  value={form.confidence_threshold}
                  onChange={(e) =>
                    setForm({ ...form, confidence_threshold: parseFloat(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="text-[10px] text-[#8b9bb4]">响应时限(秒)</label>
                <input
                  type="number"
                  min={1}
                  className={`w-full mt-1 ${inputClass}`}
                  value={form.response_seconds}
                  onChange={(e) =>
                    setForm({ ...form, response_seconds: parseInt(e.target.value, 10) || 1 })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[#8b9bb4]">温度阈值(℃)</label>
                <input
                  type="number"
                  step="0.1"
                  className={`w-full mt-1 ${inputClass}`}
                  value={form.temperature_threshold ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      temperature_threshold: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-[10px] text-[#8b9bb4]">湿度阈值(%RH)</label>
                <input
                  type="number"
                  step="0.1"
                  className={`w-full mt-1 ${inputClass}`}
                  value={form.humidity_threshold ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      humidity_threshold: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-[#8b9bb4]">推送方式</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {channelOptions.map((ch) => (
                  <label key={ch.value} className="flex items-center gap-1 text-[10px] text-[#8b9bb4]">
                    <input
                      type="checkbox"
                      checked={form.push_channels.includes(ch.value)}
                      onChange={() => toggleChannel(ch.value)}
                      className="accent-[#3b82f6]"
                    />
                    {ch.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="border border-[#1e3a5f] rounded p-3 space-y-2">
              <div className="text-[10px] text-[#e8f1ff]">作用范围（关联设备）</div>
              <div className="grid grid-cols-2 gap-2">
                {scopeOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex flex-col gap-0.5 rounded border px-2 py-1.5 cursor-pointer ${
                      form.apply_scope === opt.value
                        ? 'border-[#3b82f6] bg-[#3b82f6]/10'
                        : 'border-[#1e3a5f] hover:border-[#3b82f6]/50'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-xs text-[#e8f1ff]">
                      <input
                        type="radio"
                        name="apply_scope"
                        checked={form.apply_scope === opt.value}
                        onChange={() => setForm({ ...form, apply_scope: opt.value })}
                        className="accent-[#3b82f6]"
                      />
                      {opt.label}
                    </span>
                    <span className="text-[10px] text-[#8b9bb4] pl-5">{opt.hint}</span>
                  </label>
                ))}
              </div>

              {(form.apply_scope === 'region' || form.apply_scope === 'device_type') && (
                <div>
                  <label className="text-[10px] text-[#8b9bb4]">
                    {form.apply_scope === 'region' ? '适用林区 *' : '可选林区过滤'}
                  </label>
                  <select
                    className={`w-full mt-1 ${inputClass}`}
                    value={form.forest_zone_ref ?? ''}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      const zone = forestZones.find((z) => z.id === id);
                      setForm({
                        ...form,
                        forest_zone_ref: id,
                        region: zone?.name || '',
                      });
                    }}
                    required={form.apply_scope === 'region'}
                  >
                    <option value="">
                      {form.apply_scope === 'region' ? '请选择林区' : '不限林区'}
                    </option>
                    {forestZones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} ({z.code})
                      </option>
                    ))}
                  </select>
                  {forestZones.length === 0 && (
                    <p className="text-[10px] text-[#f59e0b] mt-1">
                      暂无林区主数据，请先在「组织管理 → 林区管理」创建
                    </p>
                  )}
                </div>
              )}

              {form.apply_scope === 'device_type' && (
                <div>
                  <label className="text-[10px] text-[#8b9bb4]">设备类型 *</label>
                  <select
                    className={`w-full mt-1 ${inputClass}`}
                    value={form.device_type}
                    onChange={(e) => setForm({ ...form, device_type: e.target.value })}
                    required
                  >
                    <option value="">请选择类型</option>
                    {deviceTypeOptions.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {form.apply_scope === 'devices' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px] text-[#8b9bb4]">
                      指定设备 *（已选 {form.device_ids.length}）
                    </label>
                    <input
                      value={deviceSearch}
                      onChange={(e) => setDeviceSearch(e.target.value)}
                      placeholder="搜索设备 ID/名称/林区"
                      className={`${inputClass} w-44`}
                    />
                  </div>
                  <div className="max-h-40 overflow-auto border border-[#1e3a5f] rounded bg-[#0f1e35]">
                    {deviceLoading ? (
                      <div className="px-3 py-4 text-[10px] text-[#8b9bb4]">加载设备中...</div>
                    ) : filteredDevices.length === 0 ? (
                      <div className="px-3 py-4 text-[10px] text-[#8b9bb4]">无匹配设备</div>
                    ) : (
                      filteredDevices.map((d) => (
                        <label
                          key={d.id}
                          className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1e3a5f]/50 text-[10px] text-[#e8f1ff] hover:bg-[#1a2d4a]"
                        >
                          <input
                            type="checkbox"
                            checked={form.device_ids.includes(d.id)}
                            onChange={() => toggleDevice(d.id)}
                            className="accent-[#3b82f6]"
                          />
                          <span className="font-mono text-[#8b9bb4]">{d.device_id}</span>
                          <span className="truncate">{d.device_name}</span>
                          <span className="ml-auto text-[#5a6a82] shrink-0">
                            {d.region || '-'}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] text-[#8b9bb4]">规则说明</label>
              <textarea
                className={`w-full mt-1 ${inputClass}`}
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-[#8b9bb4]">
              <input
                type="checkbox"
                checked={form.is_enabled}
                onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
                className="accent-[#3b82f6]"
              />
              启用规则
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeForm}
                className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
