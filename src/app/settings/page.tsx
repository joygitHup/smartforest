'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemSettings } from '@/contexts/SystemSettingsContext';
import { getDashboardOverview, getDashboardRegions } from '@/lib/api/dashboard';
import type {
  DeviceSettingsData,
  GeneralSettingsData,
  ManagementSettingsData,
  NotificationSettingsData,
} from '@/lib/system-settings';

type SettingsTab = 'general' | 'device' | 'notification' | 'system';

function formatDeviceCount(n: number): string {
  return n.toLocaleString('zh-CN');
}

function SettingsPageContent() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'general', label: '基本设置' },
    { key: 'device', label: '设备配置' },
    { key: 'notification', label: '通知设置' },
    { key: 'system', label: '系统管理' },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[#e8f1ff]">系统设置</h1>

      <div className="flex-1 grid grid-cols-[200px_1fr] gap-4 min-h-0">
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-2 h-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                activeTab === tab.key
                  ? 'bg-[#3b82f6]/15 text-[#3b82f6]'
                  : 'text-[#8b9bb4] hover:text-[#e8f1ff] hover:bg-[#0f1e35]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-6 overflow-auto">
          {activeTab === 'general' && <GeneralSettings />}
          {activeTab === 'device' && <DeviceSettings />}
          {activeTab === 'notification' && <NotificationSettings />}
          {activeTab === 'system' && <SystemSettings />}
        </div>
      </div>
    </div>
  );
}

function SettingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-[#e8f1ff] mb-3 pb-2 border-b border-[#1e3a5f]">
        {title}
      </h3>
      {children}
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div>
        <div className="text-xs text-[#e8f1ff]">{label}</div>
        {description && <div className="text-[10px] text-[#8b9bb4] mt-0.5">{description}</div>}
      </div>
      {children}
    </div>
  );
}

const selectClass =
  'bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]';
const inputClass =
  'bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] w-64';

function SaveBar({
  saving,
  message,
  error,
  onCancel,
  onSave,
}: {
  saving: boolean;
  message: string;
  error: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="pt-4 border-t border-[#1e3a5f] space-y-3">
      {error ? (
        <div className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded px-3 py-2">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="text-xs text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/30 rounded px-3 py-2">
          {message}
        </div>
      ) : null}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-4 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存设置'}
        </button>
      </div>
    </div>
  );
}

function GeneralSettings() {
  const { user } = useAuth();
  const {
    settings,
    hydrated,
    updateGeneral,
    resetGeneral,
    canEditPlatformName,
    canEditOrgSettings,
  } = useSystemSettings();
  const [form, setForm] = useState<GeneralSettingsData>(settings.general);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [areaLoading, setAreaLoading] = useState(true);
  const [areaStats, setAreaStats] = useState({
    forestZones: 0,
    regions: 0,
    devices: 0,
    forestZoneNames: [] as string[],
    regionNames: [] as string[],
  });

  useEffect(() => {
    if (hydrated) setForm(settings.general);
  }, [hydrated, settings.general]);

  useEffect(() => {
    let cancelled = false;
    setAreaLoading(true);
    void (async () => {
      try {
        const [regionsData, overview] = await Promise.all([
          getDashboardRegions(),
          getDashboardOverview(),
        ]);
        if (cancelled) return;
        setAreaStats({
          forestZones: regionsData.forest_zones?.length ?? 0,
          regions: regionsData.regions?.length ?? 0,
          devices: overview.devices?.total ?? 0,
          forestZoneNames: regionsData.forest_zones ?? [],
          regionNames: regionsData.regions ?? [],
        });
      } catch {
        if (!cancelled) {
          setAreaStats({
            forestZones: 0,
            regions: 0,
            devices: 0,
            forestZoneNames: [],
            regionNames: [],
          });
        }
      } finally {
        if (!cancelled) setAreaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.organization, user?.org_scope?.scope_label]);

  const handleSave = async () => {
    setError('');
    setMessage('');
    if (!form.platformName.trim()) {
      setError('系统平台名称不能为空');
      return;
    }
    if (!canEditOrgSettings && !canEditPlatformName) {
      setError('无权保存设置');
      return;
    }
    setSaving(true);
    try {
      await updateGeneral({
        ...form,
        platformName: form.platformName.trim(),
      });
      setMessage(
        canEditPlatformName
          ? '已保存（平台名称全平台生效，其余仅本组织）'
          : '本组织设置已保存'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(resetGeneral());
    setMessage('');
    setError('');
  };

  const scopeLabel =
    user?.org_scope?.scope_label || user?.organization_name || '当前组织';
  const areaSummary = (() => {
    if (areaLoading) return '加载中…';
    const zonePart =
      areaStats.forestZones > 0
        ? `${areaStats.forestZones}个林区`
        : `${areaStats.regions}个区域`;
    return `${zonePart} / ${formatDeviceCount(areaStats.devices)}台设备`;
  })();
  const areaDetailNames =
    areaStats.forestZoneNames.length > 0
      ? areaStats.forestZoneNames
      : areaStats.regionNames;

  return (
    <>
      <SettingSection title="平台信息">
        <SettingRow
          label="系统平台名称"
          description={
            canEditPlatformName
              ? '全平台生效，仅平台管理员可修改'
              : '全平台统一名称，仅平台管理员可修改'
          }
        >
          <input
            type="text"
            value={form.platformName}
            disabled={!canEditPlatformName}
            onChange={(e) => setForm({ ...form, platformName: e.target.value })}
            className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
          />
        </SettingRow>
        <SettingRow
          label="数据刷新间隔"
          description={`仅对本组织（${scopeLabel}）生效；指挥中心按此间隔自动刷新态势`}
        >
          <select
            value={form.refreshInterval}
            disabled={!canEditOrgSettings}
            onChange={(e) => setForm({ ...form, refreshInterval: e.target.value })}
            className={`${selectClass} disabled:opacity-50`}
          >
            <option>5秒</option>
            <option>10秒</option>
            <option>30秒</option>
            <option>60秒</option>
          </select>
        </SettingRow>
        <SettingRow label="默认地图图层" description="仅对本组织生效">
          <select
            value={form.defaultMapLayer}
            disabled={!canEditOrgSettings}
            onChange={(e) => setForm({ ...form, defaultMapLayer: e.target.value })}
            className={`${selectClass} disabled:opacity-50`}
          >
            <option>标准地图</option>
            <option>热力图</option>
            <option>火险等级图</option>
          </select>
        </SettingRow>
      </SettingSection>
      <SettingSection title="区域管理">
        <SettingRow
          label="监控区域"
          description={`本组织（${scopeLabel}）林区主数据与设备统计，已按数据视野隔离`}
        >
          <div className="text-right">
            <div className="text-xs text-[#e8f1ff] font-mono">{areaSummary}</div>
            {areaDetailNames.length > 0 ? (
              <div className="text-[10px] text-[#8b9bb4] mt-1 max-w-[280px] truncate" title={areaDetailNames.join('、')}>
                {areaDetailNames.join('、')}
              </div>
            ) : (
              !areaLoading && (
                <div className="text-[10px] text-[#8b9bb4] mt-1">暂无林区，请先维护主数据</div>
              )
            )}
            <a
              href="/organization/forest-zones"
              className="inline-block text-[10px] text-[#3b82f6] hover:underline mt-1"
            >
              前往林区管理 →
            </a>
          </div>
        </SettingRow>
        <SettingRow label="坐标系" description="仅对本组织生效">
          <select
            value={form.coordinateSystem}
            disabled={!canEditOrgSettings}
            onChange={(e) => setForm({ ...form, coordinateSystem: e.target.value })}
            className={`${selectClass} disabled:opacity-50`}
          >
            <option>WGS-84</option>
            <option>CGCS2000</option>
          </select>
        </SettingRow>
      </SettingSection>
      <SaveBar
        saving={saving}
        message={message}
        error={error}
        onCancel={handleCancel}
        onSave={() => void handleSave()}
      />
    </>
  );
}

function DeviceSettings() {
  const {
    settings,
    hydrated,
    updateDevice,
    resetDevice,
    canEditOrgSettings,
  } = useSystemSettings();
  const [form, setForm] = useState<DeviceSettingsData>(settings.device);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (hydrated) setForm(settings.device);
  }, [hydrated, settings.device]);

  const handleSave = async () => {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await updateDevice(form);
      setMessage('设备配置已保存（仅本组织生效，并已下发采集指令）');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEditOrgSettings || saving;

  return (
    <>
      <div className="mb-3 text-[11px] text-[#8b9bb4] leading-relaxed">
        采集参数按组织隔离保存。保存后：
        <span className="text-[#e8f1ff]">环境传感上报周期</span>
        将用于本组织设备遥测入库削峰，并经 MQTT 下发
        <span className="font-mono text-[#06b6d4]"> set_collection_config </span>
        至本组织设备；视频采集/编码等随指令一并下发。
        {!canEditOrgSettings && (
          <span className="text-[#f59e0b]"> 当前账号无权限修改本组织设置。</span>
        )}
      </div>
      <SettingSection title="采集参数">
        <SettingRow label="视频采集频率" description="可见光相机采集间隔（下发设备）">
          <select
            value={form.videoCapture}
            disabled={disabled}
            onChange={(e) => setForm({ ...form, videoCapture: e.target.value })}
            className={`${selectClass} disabled:opacity-50`}
          >
            <option>连续采集</option>
            <option>间隔5秒</option>
            <option>间隔10秒</option>
            <option>事件触发</option>
          </select>
        </SettingRow>
        <SettingRow
          label="环境传感器上报周期"
          description="温湿度等上报间隔；同时作为本组织遥测入库最小间隔"
        >
          <select
            value={form.sensorInterval}
            disabled={disabled}
            onChange={(e) => setForm({ ...form, sensorInterval: e.target.value })}
            className={`${selectClass} disabled:opacity-50`}
          >
            <option>1分钟</option>
            <option>5分钟</option>
            <option>10分钟</option>
          </select>
        </SettingRow>
        <SettingRow label="视频编码格式" description="遵循GB/T 43958-2024标准">
          <select
            value={form.videoCodec}
            disabled={disabled}
            onChange={(e) => setForm({ ...form, videoCodec: e.target.value })}
            className={`${selectClass} disabled:opacity-50`}
          >
            <option>H.265 (自适应)</option>
            <option>H.264</option>
          </select>
        </SettingRow>
      </SettingSection>
      <SettingSection title="离线策略">
        <SettingRow label="本地缓存时长" description="断网时本地存储视频时长">
          <select
            value={form.offlineCacheDays}
            disabled={disabled}
            onChange={(e) => setForm({ ...form, offlineCacheDays: e.target.value })}
            className={`${selectClass} disabled:opacity-50`}
          >
            <option>≥7天</option>
            <option>≥3天</option>
            <option>≥14天</option>
          </select>
        </SettingRow>
        <SettingRow label="断网续传" description="网络恢复后自动补传缓存数据">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.resumeUpload}
              disabled={disabled}
              onChange={(e) => setForm({ ...form, resumeUpload: e.target.checked })}
              className="accent-[#3b82f6]"
            />
            <span className="text-xs text-[#8b9bb4]">
              {form.resumeUpload ? '已启用' : '已关闭'}
            </span>
          </label>
        </SettingRow>
      </SettingSection>
      <SaveBar
        saving={saving}
        message={message}
        error={error}
        onCancel={() => {
          setForm(resetDevice());
          setMessage('');
          setError('');
        }}
        onSave={() => void handleSave()}
      />
    </>
  );
}

function NotificationSettings() {
  const {
    settings,
    hydrated,
    updateNotification,
    resetNotification,
    canEditOrgSettings,
  } = useSystemSettings();
  const { user } = useAuth();
  const [form, setForm] = useState<NotificationSettingsData>(settings.notification);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [dutyLoading, setDutyLoading] = useState(true);
  const [dutyError, setDutyError] = useState('');
  const [dutyMode, setDutyMode] = useState('three_shift');
  const [dutyModeChoices, setDutyModeChoices] = useState<Array<{ value: string; label: string }>>(
    []
  );
  const [shifts, setShifts] = useState<
    Array<{ id: number; code: string; name: string; start_time: string; end_time: string }>
  >([]);
  const [currentLabel, setCurrentLabel] = useState('加载中...');
  const [groups, setGroups] = useState<
    Array<{
      id: number;
      name: string;
      member_ids?: number[];
      members_brief?: Array<{ id: number; full_name: string; phone?: string }>;
      member_count?: number;
    }>
  >([]);
  const [orgUsers, setOrgUsers] = useState<
    Array<{ id: number; username: string; full_name?: string; phone?: string }>
  >([]);
  const [assignDate, setAssignDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assignShiftId, setAssignShiftId] = useState<number | ''>('');
  const [assignGroupId, setAssignGroupId] = useState<number | ''>('');
  const [assignUserIds, setAssignUserIds] = useState<number[]>([]);
  const [todayAssignments, setTodayAssignments] = useState<
    Array<{
      id: number;
      shift_name: string;
      group_name?: string;
      members: Array<{ full_name: string }>;
    }>
  >([]);
  const [groupName, setGroupName] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<number[]>([]);
  const [dutyBusy, setDutyBusy] = useState(false);

  const canManageDuty = Boolean(
    user?.org_scope?.unrestricted ||
      user?.is_superuser ||
      user?.role === 'admin' ||
      user?.is_staff
  );

  useEffect(() => {
    if (hydrated) setForm(settings.notification);
  }, [hydrated, settings.notification]);

  const loadDuty = async () => {
    setDutyLoading(true);
    setDutyError('');
    try {
      const [{ getDutyRosterSettings, getDutyGroups, getDutyAssignments }, { getUsers }] =
        await Promise.all([
          import('@/lib/api/duty-roster'),
          import('@/lib/api/organization'),
        ]);
      const bundle = await getDutyRosterSettings();
      setDutyMode(bundle.settings.duty_mode);
      setDutyModeChoices(bundle.duty_mode_choices || []);
      setShifts(bundle.shifts || []);
      setCurrentLabel(bundle.current?.label || '暂无值班');
      if (!assignShiftId && bundle.shifts?.[0]) {
        setAssignShiftId(bundle.shifts[0].id);
      }
      const [groupRes, userRes, assignRes] = await Promise.all([
        getDutyGroups({ page_size: 100 }),
        getUsers({ page: 1, page_size: 200, is_active: true }),
        getDutyAssignments({
          start: assignDate,
          end: assignDate,
        }),
      ]);
      setGroups(groupRes.results || []);
      setOrgUsers(
        (userRes.results || []).map((u) => ({
          id: u.id,
          username: u.username,
          full_name: u.full_name || `${u.last_name || ''}${u.first_name || ''}`.trim() || u.username,
          phone: u.phone,
        }))
      );
      setTodayAssignments(assignRes.results || []);
      // 同步本地 dutyMode 文案
      const modeLabel =
        bundle.duty_mode_choices?.find((c) => c.value === bundle.settings.duty_mode)?.label ||
        bundle.settings.duty_mode_display ||
        form.dutyMode;
      setForm((prev) => ({ ...prev, dutyMode: modeLabel }));
    } catch (err) {
      setDutyError(err instanceof Error ? err.message : '加载值班排班失败');
      setCurrentLabel('加载失败');
    } finally {
      setDutyLoading(false);
    }
  };

  useEffect(() => {
    void loadDuty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignDate]);

  const toggle = (key: keyof NotificationSettingsData) => {
    if (typeof form[key] !== 'boolean') return;
    setForm({ ...form, [key]: !form[key] });
  };

  const handleSave = async () => {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await updateNotification(form);
      setMessage('通知设置已保存（仅本组织）');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDutyModeChange = async (mode: string) => {
    setDutyBusy(true);
    setDutyError('');
    try {
      const { updateDutyRosterMode } = await import('@/lib/api/duty-roster');
      const bundle = await updateDutyRosterMode(mode);
      setDutyMode(bundle.settings.duty_mode);
      setShifts(bundle.shifts || []);
      setCurrentLabel(bundle.current?.label || '暂无值班');
      const modeLabel =
        bundle.duty_mode_choices?.find((c) => c.value === bundle.settings.duty_mode)?.label ||
        bundle.settings.duty_mode_display ||
        mode;
      const next = { ...form, dutyMode: modeLabel };
      setForm(next);
      if (canEditOrgSettings) {
        await updateNotification(next);
      }
      if (bundle.shifts?.[0]) setAssignShiftId(bundle.shifts[0].id);
      setMessage('排班模式已更新');
    } catch (err) {
      setDutyError(err instanceof Error ? err.message : '更新排班模式失败');
    } finally {
      setDutyBusy(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setDutyError('请填写值班组名称');
      return;
    }
    setDutyBusy(true);
    setDutyError('');
    try {
      const { createDutyGroup } = await import('@/lib/api/duty-roster');
      await createDutyGroup({
        name: groupName.trim(),
        member_ids: groupMemberIds,
      });
      setGroupName('');
      setGroupMemberIds([]);
      await loadDuty();
      setMessage('值班组已创建');
    } catch (err) {
      setDutyError(err instanceof Error ? err.message : '创建值班组失败');
    } finally {
      setDutyBusy(false);
    }
  };

  const handleSaveAssignment = async () => {
    if (!assignShiftId) {
      setDutyError('请选择班次');
      return;
    }
    if (!assignGroupId && assignUserIds.length === 0) {
      setDutyError('请选择值班组或至少一名值班人员');
      return;
    }
    setDutyBusy(true);
    setDutyError('');
    try {
      const { upsertDutyAssignment } = await import('@/lib/api/duty-roster');
      await upsertDutyAssignment({
        duty_date: assignDate,
        shift_id: Number(assignShiftId),
        group_id: assignGroupId === '' ? null : Number(assignGroupId),
        user_ids: assignUserIds,
      });
      await loadDuty();
      setMessage('当日排班已保存');
    } catch (err) {
      setDutyError(err instanceof Error ? err.message : '保存排班失败');
    } finally {
      setDutyBusy(false);
    }
  };

  const toggleId = (list: number[], id: number): number[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <>
      <SettingSection title="推送渠道">
        <p className="text-[10px] text-[#8b9bb4] mb-2">
          站内信启用后，告警将写入本组织用户的消息中心（顶栏铃铛）。关闭后不再投递站内信。
        </p>
        {(
          [
            { key: 'inApp', label: '站内信', description: '平台内消息通知（顶栏铃铛可查看）' },
            { key: 'appPush', label: 'App推送', description: '护林员App消息推送' },
            { key: 'sms', label: '短信通知', description: '二级及以上告警发送短信' },
            { key: 'voiceCall', label: '语音电话', description: '一级告警自动拨打值班电话' },
            { key: 'forestryLine', label: '林草局专线', description: '一级告警推送至林草局' },
          ] as const
        ).map((item) => (
          <SettingRow key={item.key} label={item.label} description={item.description}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form[item.key]}
                onChange={() => toggle(item.key)}
                className="accent-[#3b82f6]"
              />
              <span className="text-xs text-[#8b9bb4]">
                {form[item.key] ? '已启用' : '已关闭'}
              </span>
            </label>
          </SettingRow>
        ))}
      </SettingSection>

      <SettingSection title="值班排班">
        <p className="text-[10px] text-[#8b9bb4] mb-2">
          按本组织编排值班组与班次；一级/二级告警将额外通知当前班次值班人员
        </p>
        {dutyError && (
          <div className="mb-2 text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded px-3 py-2">
            {dutyError}
          </div>
        )}
        <SettingRow label="当前值班" description="按当前时间解析班次与排班">
          <span className="text-xs text-[#e8f1ff] text-right max-w-[320px]">
            {dutyLoading ? '加载中...' : currentLabel}
          </span>
        </SettingRow>
        <SettingRow label="排班模式" description="切换后自动同步班次模板">
          <select
            value={dutyMode}
            disabled={!canManageDuty || dutyBusy}
            onChange={(e) => void handleDutyModeChange(e.target.value)}
            className={selectClass}
          >
            {(dutyModeChoices.length
              ? dutyModeChoices
              : [
                  { value: 'three_shift', label: '三班倒' },
                  { value: 'two_shift', label: '两班倒' },
                  { value: 'custom', label: '自定义' },
                ]
            ).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="班次时段" description="当前模式下的班次">
          <div className="text-[10px] text-[#8b9bb4] text-right space-y-0.5">
            {shifts.length === 0 ? (
              <span>暂无班次</span>
            ) : (
              shifts.map((s) => (
                <div key={s.id}>
                  {s.name} {s.start_time}-{s.end_time}
                </div>
              ))
            )}
          </div>
        </SettingRow>

        {canManageDuty && (
          <>
            <div className="mt-4 pt-3 border-t border-[#1e3a5f]/60">
              <div className="text-xs text-[#e8f1ff] mb-2">值班组</div>
              <div className="space-y-2 mb-3">
                {groups.length === 0 ? (
                  <div className="text-[10px] text-[#8b9bb4]">暂无值班组，请先创建</div>
                ) : (
                  groups.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-start justify-between gap-2 text-[10px] bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5"
                    >
                      <div>
                        <span className="text-[#e8f1ff]">{g.name}</span>
                        <span className="text-[#8b9bb4] ml-2">
                          {(g.members_brief || []).map((m) => m.full_name).join('、') ||
                            `${g.member_count || 0} 人`}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex flex-wrap gap-2 items-start">
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="新值班组名称，如 A组"
                  className={inputClass}
                />
                <div className="flex flex-wrap gap-1 max-w-[360px]">
                  {orgUsers.slice(0, 12).map((u) => (
                    <label
                      key={u.id}
                      className={`px-1.5 py-0.5 rounded border text-[10px] cursor-pointer ${
                        groupMemberIds.includes(u.id)
                          ? 'border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/10'
                          : 'border-[#1e3a5f] text-[#8b9bb4]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={groupMemberIds.includes(u.id)}
                        onChange={() => setGroupMemberIds((prev) => toggleId(prev, u.id))}
                      />
                      {u.full_name || u.username}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={dutyBusy}
                  onClick={() => void handleCreateGroup()}
                  className="px-3 py-1.5 rounded text-xs bg-[#1e3a5f] text-[#e8f1ff] hover:bg-[#243f66] disabled:opacity-50"
                >
                  创建值班组
                </button>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#1e3a5f]/60">
              <div className="text-xs text-[#e8f1ff] mb-2">当日排班</div>
              <div className="flex flex-wrap gap-2 mb-2">
                <input
                  type="date"
                  value={assignDate}
                  onChange={(e) => setAssignDate(e.target.value)}
                  className={selectClass}
                />
                <select
                  value={assignShiftId}
                  onChange={(e) =>
                    setAssignShiftId(e.target.value ? Number(e.target.value) : '')
                  }
                  className={selectClass}
                >
                  <option value="">选择班次</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.start_time}-{s.end_time})
                    </option>
                  ))}
                </select>
                <select
                  value={assignGroupId}
                  onChange={(e) =>
                    setAssignGroupId(e.target.value ? Number(e.target.value) : '')
                  }
                  className={selectClass}
                >
                  <option value="">不选组 / 仅指定人员</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-1 mb-2 max-w-[520px]">
                {orgUsers.map((u) => (
                  <label
                    key={u.id}
                    className={`px-1.5 py-0.5 rounded border text-[10px] cursor-pointer ${
                      assignUserIds.includes(u.id)
                        ? 'border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/10'
                        : 'border-[#1e3a5f] text-[#8b9bb4]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={assignUserIds.includes(u.id)}
                      onChange={() => setAssignUserIds((prev) => toggleId(prev, u.id))}
                    />
                    {u.full_name || u.username}
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={dutyBusy}
                onClick={() => void handleSaveAssignment()}
                className="px-3 py-1.5 rounded text-xs bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-50"
              >
                保存该班次排班
              </button>
              <div className="mt-3 space-y-1">
                {todayAssignments.length === 0 ? (
                  <div className="text-[10px] text-[#8b9bb4]">所选日期暂无排班</div>
                ) : (
                  todayAssignments.map((a) => (
                    <div key={a.id} className="text-[10px] text-[#8b9bb4]">
                      <span className="text-[#e8f1ff]">{a.shift_name}</span>
                      {a.group_name ? ` · ${a.group_name}` : ''}
                      {' · '}
                      {a.members.map((m) => m.full_name).join('、') || '未指定人员'}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </SettingSection>

      <SaveBar
        saving={saving}
        message={message}
        error={error}
        onCancel={() => {
          setForm(resetNotification());
          setMessage('');
          setError('');
        }}
        onSave={() => void handleSave()}
      />
    </>
  );
}

function SystemSettings() {
  const { settings, hydrated, updateManagement, resetManagement } =
    useSystemSettings();
  const [form, setForm] = useState<ManagementSettingsData>(settings.management);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cacheMessage, setCacheMessage] = useState('');
  const [kafkaOk, setKafkaOk] = useState<boolean | null>(null);
  const [kafkaDetail, setKafkaDetail] = useState('');

  useEffect(() => {
    if (hydrated) setForm(settings.management);
  }, [hydrated, settings.management]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getPipelineHealth } = await import('@/lib/api/pipeline');
        const health = await getPipelineHealth();
        if (cancelled) return;
        setKafkaOk(health.kafka.ok);
        setKafkaDetail(
          health.kafka.ok
            ? `${health.kafka.bootstrap_servers.join(',')} · ${health.pipeline.enabled ? '管线开启' : '管线关闭'}`
            : health.kafka.error || '不可用'
        );
      } catch {
        if (!cancelled) {
          setKafkaOk(false);
          setKafkaDetail('探测失败');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setError('');
    setMessage('');
    setCacheMessage('');
    setSaving(true);
    try {
      await updateManagement(form);
      setMessage('系统管理设置已保存（仅本组织）');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const clearCache = () => {
    try {
      const keepKeys = ['access_token', 'refresh_token', 'user', 'smartforest_system_settings'];
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && !keepKeys.includes(key)) toRemove.push(key);
      }
      toRemove.forEach((key) => localStorage.removeItem(key));
      setCacheMessage('缓存已清除（已保留登录态与系统设置）');
      setMessage('');
      setError('');
    } catch {
      setCacheMessage('清除缓存失败');
    }
  };

  return (
    <>
      <SettingSection title="系统信息">
        <SettingRow label="系统版本" description="当前平台版本号">
          <span className="text-xs text-[#e8f1ff] font-mono">v2.1.0</span>
        </SettingRow>
        <SettingRow label="IoT平台" description="阿里云IoT企业版">
          <span className="text-xs text-[#10b981]">已连接</span>
        </SettingRow>
        <SettingRow label="AI引擎" description="达摩院视觉大模型">
          <span className="text-xs text-[#10b981]">运行中</span>
        </SettingRow>
        <SettingRow label="通信协议" description="遵循Alink JSON格式">
          <span className="text-xs text-[#e8f1ff] font-mono">Alink v1.0</span>
        </SettingRow>
        <SettingRow label="Kafka" description="设备数据管线 MQTT → Kafka → Celery">
          {kafkaOk === null ? (
            <span className="text-xs text-[#8b9bb4]">检测中…</span>
          ) : kafkaOk ? (
            <span className="text-xs text-[#10b981]" title={kafkaDetail}>
              已连接 · {kafkaDetail}
            </span>
          ) : (
            <span className="text-xs text-[#ef4444]" title={kafkaDetail}>
              未连接 · {kafkaDetail}
            </span>
          )}
        </SettingRow>
      </SettingSection>
      <SettingSection title="数据管理">
        <SettingRow label="数据保留策略" description="历史数据保留时长">
          <select
            value={form.dataRetention}
            onChange={(e) => setForm({ ...form, dataRetention: e.target.value })}
            className={selectClass}
          >
            <option>90天</option>
            <option>180天</option>
            <option>365天</option>
            <option>永久保留</option>
          </select>
        </SettingRow>
        <SettingRow label="视频存储" description="录像文件存储策略">
          <select
            value={form.videoStorage}
            onChange={(e) => setForm({ ...form, videoStorage: e.target.value })}
            className={selectClass}
          >
            <option>告警片段保留30天</option>
            <option>全量保留7天</option>
            <option>全量保留30天</option>
          </select>
        </SettingRow>
      </SettingSection>
      <SettingSection title="维护操作">
        <SettingRow label="系统备份" description="上次备份时间">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#8b9bb4] font-mono">2026-08-02 03:00</span>
            <button
              type="button"
              className="px-3 py-1 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors"
              onClick={() => {
                setCacheMessage('备份任务已提交（演示）');
                setMessage('');
                setError('');
              }}
            >
              立即备份
            </button>
          </div>
        </SettingRow>
        <SettingRow label="清除缓存" description="清除前端缓存数据">
          <button
            type="button"
            onClick={clearCache}
            className="px-3 py-1 text-xs border border-[#f59e0b]/30 text-[#f59e0b] rounded hover:bg-[#f59e0b]/10 transition-colors"
          >
            清除缓存
          </button>
        </SettingRow>
      </SettingSection>
      {cacheMessage ? (
        <div className="mb-3 text-xs text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/30 rounded px-3 py-2">
          {cacheMessage}
        </div>
      ) : null}
      <SaveBar
        saving={saving}
        message={message}
        error={error}
        onCancel={() => {
          setForm(resetManagement());
          setMessage('');
          setError('');
        }}
        onSave={() => void handleSave()}
      />
    </>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsPageContent />
    </AuthGuard>
  );
}
