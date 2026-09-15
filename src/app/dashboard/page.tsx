'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth-guard';
import { useRegionFilter } from '@/contexts/RegionFilterContext';
import { getDashboardOverview } from '@/lib/api/dashboard';
import { getDevice, type Device } from '@/lib/api/devices';
import DeviceControlPanel from '@/components/devices/device-control-panel';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemSettings } from '@/contexts/SystemSettingsContext';
import { useDashboardSocket } from '@/hooks/useDashboardSocket';
import { mapLayerFromSetting, parseIntervalToMs } from '@/lib/system-settings';
import type {
  DashboardMapDevice,
  DashboardOverview,
  DashboardRecentAlert,
} from '@/types/dashboard';
import type { SituationalMapLayer } from '@/components/dashboard/situational-map';

const SituationalMap = dynamic(() => import('@/components/dashboard/situational-map'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-xs text-[#8b9bb4]">
      地图加载中…
    </div>
  ),
});

type MapLayer = SituationalMapLayer;

function StatCard({
  label,
  value,
  unit,
  trend,
  color,
}: {
  label: string;
  value: string | number;
  unit?: string;
  trend?: string;
  color: string;
}) {
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

function AlertBadge({ level }: { level: string }) {
  const configs: Record<string, { color: string; text: string; pulse: boolean }> = {
    level_1: { color: 'bg-[#ef4444]', text: '一级', pulse: true },
    level_2: { color: 'bg-[#f59e0b]', text: '二级', pulse: false },
    level_3: { color: 'bg-[#3b82f6]', text: '三级', pulse: false },
  };
  const config = configs[level] || { color: 'bg-gray-500', text: '未知', pulse: false };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-white ${config.color} ${
        config.pulse ? 'animate-pulse' : ''
      }`}
    >
      {config.pulse && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
      {config.text}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { color: string; text: string }> = {
    new: { color: 'text-[#f59e0b]', text: '待处理' },
    acknowledged: { color: 'text-[#a78bfa]', text: '已确认' },
    pending: { color: 'text-[#f59e0b]', text: '待处理' },
    dispatched: { color: 'text-[#3b82f6]', text: '已派单' },
    processing: { color: 'text-[#06b6d4]', text: '处置中' },
    resolved: { color: 'text-[#10b981]', text: '已处置' },
    false_alarm: { color: 'text-[#8b9bb4]', text: '误报' },
    escalated: { color: 'text-[#ef4444]', text: '已升级' },
  };
  const config = configs[status] || { color: 'text-[#8b9bb4]', text: status };
  return <span className={`text-xs font-mono ${config.color}`}>{config.text}</span>;
}

function formatTime(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatNum(value?: number | null, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toFixed(digits);
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const { user: currentUser } = useAuth();
  const { settings, hydrated } = useSystemSettings();
  const canControl =
    !!currentUser &&
    (currentUser.is_superuser === true ||
      currentUser.is_staff === true ||
      currentUser.role === 'admin' ||
      currentUser.role === 'operator' ||
      currentUser.role === 'forester');
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { region, setRegion, area, setArea, forestZones, areasForCurrentZone, forestZoneItems } =
    useRegionFilter();
  const [mapLayer, setMapLayer] = useState<MapLayer>('standard');
  const [selectedMapDevice, setSelectedMapDevice] = useState<DashboardMapDevice | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<Device | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [liveHint, setLiveHint] = useState('连接中…');
  const layerBootstrapped = useRef(false);

  useEffect(() => {
    if (!hydrated || layerBootstrapped.current) return;
    setMapLayer(mapLayerFromSetting(settings.general.defaultMapLayer));
    layerBootstrapped.current = true;
  }, [hydrated, settings.general.defaultMapLayer]);
  const loadOverview = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError('');
    try {
      const data = await getDashboardOverview({
        // 顶部/指挥中心主筛选：林区
        forest_zone: region || undefined,
        // 二级筛选：片区/区域
        region: area || undefined,
      });
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [region, area]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // 定时刷新：跟随组织「数据刷新间隔」
  useEffect(() => {
    const ms = Math.max(
      5_000,
      parseIntervalToMs(settings.general.refreshInterval, 10_000)
    );
    const timer = setInterval(() => {
      void loadOverview({ silent: true });
    }, ms);
    return () => clearInterval(timer);
  }, [loadOverview, settings.general.refreshInterval]);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useDashboardSocket(true, (msg) => {
    if (msg.type === 'connection_established') {
      setLiveHint('实时连接');
      return;
    }
    if (msg.type === 'in_app') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sf:in-app', { detail: msg.data }));
      }
      return;
    }
    if (msg.type === 'telemetry') {
      // 遥测不触发全量 overview，避免高频刷新
      return;
    }
    if (msg.type === 'alert' || msg.type === 'device_status' || msg.type === 'fire_tracing') {
      setLiveHint('有更新');
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        void loadOverview({ silent: true });
      }, 4000);
    }
  });

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const zoneSelectOptions =
    forestZoneItems.length > 0
      ? forestZoneItems.map((z) => ({
          value: z.name,
          label:
            z.organization_name && z.organization_name !== z.name
              ? `${z.organization_name} · ${z.name}`
              : z.name,
        }))
      : (forestZones.length > 0
          ? forestZones
          : overview?.filters.forest_zones || []
        ).map((name) => ({ value: name, label: name }));

  const areaOptions = areasForCurrentZone;

  const openDevice = async (mapDevice: DashboardMapDevice) => {
    setSelectedMapDevice(mapDevice);
    setDetailLoading(true);
    setActionMsg('');
    try {
      const detail = await getDevice(mapDevice.id);
      setSelectedDetail(detail);
    } catch (err) {
      setSelectedDetail(null);
      setActionMsg(err instanceof Error ? err.message : '加载设备详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDevice = () => {
    setSelectedMapDevice(null);
    setSelectedDetail(null);
    setActionMsg('');
  };

  const recentAlerts: DashboardRecentAlert[] = overview?.alerts.recent || [];
  const fireHighlights = overview?.fire_tracing.highlights || [];
  const vs = overview?.alerts.vs_yesterday ?? 0;

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-[#e8f1ff]">指挥中心</h1>
          <span className="flex items-center gap-1.5 text-[10px] text-[#8b9bb4]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                liveHint === '实时连接' ? 'bg-[#10b981]' : 'bg-[#f59e0b]'
              } animate-pulse`}
            />
            {liveHint}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#8b9bb4] whitespace-nowrap">林区</span>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              title="与顶部筛选同步"
              className="bg-[#152238] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] min-w-[160px]"
            >
              <option value="">全部林区</option>
              {zoneSelectOptions.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#8b9bb4] whitespace-nowrap">区域</span>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              disabled={!region}
              className="bg-[#152238] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] min-w-[120px] disabled:opacity-50"
              title={!region ? '与顶部筛选同步：请先选择林区' : '与顶部筛选同步'}
            >
              <option value="">{!region ? '先选林区' : '全部片区'}</option>
              {areaOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6]"
          >
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          label="在线设备"
          value={loading && !overview ? '…' : overview?.devices.online ?? 0}
          unit="台"
          trend={`共 ${overview?.devices.total ?? 0} 台 · 告警态 ${overview?.devices.alarm ?? 0}`}
          color="text-[#10b981]"
        />
        <StatCard
          label="当日告警"
          value={loading && !overview ? '…' : overview?.alerts.today ?? 0}
          unit="次"
          trend={
            vs === 0
              ? '与昨日持平'
              : vs > 0
                ? `较昨日 +${vs}`
                : `较昨日 ${vs}`
          }
          color="text-[#f59e0b]"
        />
        <StatCard
          label="误报率"
          value={loading && !overview ? '…' : formatNum(overview?.alerts.false_alarm_rate, 1)}
          unit="%"
          trend={`未处置 ${overview?.alerts.unresolved ?? 0} 条`}
          color="text-[#06b6d4]"
        />
        <StatCard
          label="碳汇值"
          value={loading && !overview ? '…' : formatNum(overview?.carbon.value, 2)}
          unit={overview?.carbon.unit || 't'}
          trend={overview?.carbon.source === 'daily_report' ? '今日日报' : '年度累计'}
          color="text-[#10b981]"
        />
        <StatCard
          label="平均温度"
          value={loading && !overview ? '…' : formatNum(overview?.environment.avg_temperature, 1)}
          unit="℃"
          trend="全区均值"
          color="text-[#f59e0b]"
        />
        <StatCard
          label="平均湿度"
          value={loading && !overview ? '…' : formatNum(overview?.environment.avg_humidity, 1)}
          unit="%RH"
          trend={
            overview?.environment.avg_wind_speed != null
              ? `风速 ${formatNum(overview.environment.avg_wind_speed, 1)} m/s`
              : '全区均值'
          }
          color="text-[#3b82f6]"
        />
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 min-h-0">
        {/* Map */}
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg flex flex-col overflow-hidden min-h-[320px]">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e3a5f] gap-2 flex-wrap">
            <div className="flex items-center gap-4">
              <span className="text-xs text-[#8b9bb4]">GIS 态势图</span>
              <div className="flex items-center gap-1">
                {(['standard', 'thermal', 'fire'] as const).map((layer) => (
                  <button
                    key={layer}
                    type="button"
                    onClick={() => setMapLayer(layer)}
                    className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                      mapLayer === layer
                        ? 'bg-[#3b82f6] text-white'
                        : 'text-[#8b9bb4] hover:text-[#e8f1ff]'
                    }`}
                  >
                    {{ standard: '标准', thermal: '热力', fire: '火险' }[layer]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-[#8b9bb4]">
              <span>点位 {overview?.map_devices.length ?? 0}</span>
              <Link href="/fire-tracing" className="text-[#3b82f6] hover:underline">
                火情 {overview?.fire_tracing.active_count ?? 0} →
              </Link>
            </div>
          </div>
          <div className="flex-1 relative bg-[#0f1e35] overflow-hidden min-h-[320px]">
            <SituationalMap
              devices={overview?.map_devices || []}
              fireHighlights={fireHighlights}
              layer={mapLayer}
              loading={loading}
              onDeviceClick={(d) => void openDevice(d)}
            />

            <div className="absolute bottom-3 left-3 z-10 bg-[#0c1a2e]/90 border border-[#1e3a5f] rounded px-3 py-2 pointer-events-none">
              <div className="flex items-center gap-4 text-[10px] text-[#8b9bb4]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                  在线
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
                  告警
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#8b9bb4]" />
                  离线
                </span>
                <span className="text-[#6b7c99]">悬停标注可看详情</span>
              </div>
            </div>
          </div>
        </div>

        {/* Alerts rail */}
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg flex flex-col overflow-hidden min-h-[280px]">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e3a5f]">
            <span className="text-xs text-[#8b9bb4]">实时告警（最新10条）</span>
            <Link href="/alerts/records" className="text-[10px] text-[#f59e0b] font-mono hover:underline">
              {overview?.alerts.unresolved ?? 0} 条未处理 →
            </Link>
          </div>
          <div className="flex-1 overflow-auto">
            {loading && recentAlerts.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-[#8b9bb4]">加载中…</div>
            )}
            {!loading && recentAlerts.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-[#8b9bb4]">今日暂无告警</div>
            )}
            {recentAlerts.map((alert) => (
              <Link
                key={alert.id}
                href="/alerts/records"
                className="block px-4 py-3 border-b border-[#1e3a5f]/50 hover:bg-[#1a2d4a] transition-colors"
              >
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertBadge level={alert.alert_level} />
                    <span className="text-xs text-[#e8f1ff] truncate">
                      [{alert.alert_type_display || alert.alert_type}]
                    </span>
                  </div>
                  <span className="text-[10px] text-[#8b9bb4] font-mono shrink-0">
                    {formatTime(alert.occurred_at || alert.created_at)}
                  </span>
                </div>
                <div className="text-xs text-[#8b9bb4] mb-1 truncate">
                  {alert.device_name || alert.title}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-[#8b9bb4] font-mono truncate">
                    {alert.longitude != null ? `东经${Number(alert.longitude).toFixed(4)}°` : alert.region || '-'}
                  </span>
                  <StatusBadge status={alert.status} />
                </div>
              </Link>
            ))}
          </div>

          {fireHighlights.length > 0 && (
            <div className="border-t border-[#1e3a5f] px-4 py-2">
              <div className="text-[10px] text-[#8b9bb4] mb-1">活跃火情</div>
              {fireHighlights.slice(0, 2).map((ft) => (
                <Link
                  key={ft.id}
                  href="/fire-tracing"
                  className="block text-[11px] text-[#ef4444] truncate hover:underline py-0.5"
                >
                  {ft.alert_title || ft.alert_id}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Device detail modal */}
      {(selectedMapDevice || selectedDetail) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeDevice}
        >
          <div
            className="bg-[#152238] border border-[#1e3a5f] rounded-lg w-[720px] max-w-[95vw] max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e3a5f]">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-[#e8f1ff]">设备详情</span>
                <span className="text-xs text-[#8b9bb4] font-mono">
                  [{selectedDetail?.device_id || selectedMapDevice?.device_id}]
                </span>
                <span
                  className={`text-xs ${
                    (selectedDetail?.status || selectedMapDevice?.status) === 'online'
                      ? 'text-[#10b981]'
                      : (selectedDetail?.status || selectedMapDevice?.status) === 'alarm'
                        ? 'text-[#ef4444]'
                        : 'text-[#8b9bb4]'
                  }`}
                >
                  {selectedDetail?.status_display ||
                    selectedMapDevice?.status_display ||
                    selectedMapDevice?.status}
                </span>
              </div>
              <button
                type="button"
                onClick={closeDevice}
                className="text-[#8b9bb4] hover:text-[#e8f1ff]"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              {detailLoading && (
                <div className="text-xs text-[#8b9bb4]">加载详情…</div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-xs">
                  <span className="text-[#8b9bb4]">信号强度: </span>
                  <span className="text-[#e8f1ff] font-mono">
                    {selectedDetail?.signal_strength ?? selectedMapDevice?.signal_strength ?? '-'}/5
                  </span>
                </div>
                <div className="text-xs">
                  <span className="text-[#8b9bb4]">电池电量: </span>
                  <span className="text-[#e8f1ff] font-mono">
                    {selectedDetail?.battery_level ?? selectedMapDevice?.battery_level ?? '-'}%
                  </span>
                </div>
                <div className="text-xs">
                  <span className="text-[#8b9bb4]">所属林区: </span>
                  <span className="text-[#e8f1ff]">
                    {selectedDetail?.forest_zone ||
                      selectedMapDevice?.forest_zone ||
                      selectedDetail?.region ||
                      selectedMapDevice?.region ||
                      '-'}
                  </span>
                </div>
                <div className="text-xs">
                  <span className="text-[#8b9bb4]">最后在线: </span>
                  <span className="text-[#e8f1ff] font-mono">
                    {formatTime(
                      selectedDetail?.last_online_time || selectedMapDevice?.last_online_time
                    )}
                  </span>
                </div>
              </div>

              {(selectedDetail?.device_type === 'dual_camera' ||
                selectedMapDevice?.device_type === 'dual_camera') && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                    <div className="text-[10px] text-[#8b9bb4] mb-2">可见光画面</div>
                    <div className="aspect-video bg-[#0a1628] rounded flex items-center justify-center text-xs text-[#8b9bb4]">
                      实时视频流（待接入）
                    </div>
                  </div>
                  <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                    <div className="text-[10px] text-[#8b9bb4] mb-2">红外热成像</div>
                    <div className="aspect-video bg-gradient-to-br from-[#1e3a5f] via-[#f59e0b]/20 to-[#ef4444]/20 rounded flex items-center justify-center text-xs text-[#8b9bb4]">
                      热力图（待接入）
                    </div>
                  </div>
                  <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                    <div className="text-[10px] text-[#8b9bb4] mb-2">云台姿态</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">水平角</span>
                        <span className="text-[#e8f1ff] font-mono">
                          {selectedDetail?.pan_angle ?? selectedMapDevice?.pan_angle ?? '-'}°
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">垂直角</span>
                        <span className="text-[#e8f1ff] font-mono">
                          {selectedDetail?.tilt_angle ?? selectedMapDevice?.tilt_angle ?? '-'}°
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8b9bb4]">类型</span>
                        <span className="text-[#e8f1ff]">
                          {selectedDetail?.device_type_display ||
                            selectedMapDevice?.device_type_display ||
                            '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {actionMsg && (
                <div className="text-[11px] text-[#93c5fd] bg-[#3b82f6]/10 border border-[#3b82f6]/30 rounded px-3 py-2">
                  {actionMsg}
                </div>
              )}

              {selectedDetail ? (
                <DeviceControlPanel
                  device={selectedDetail}
                  canControl={canControl}
                  compact
                  onMessage={setActionMsg}
                  onPoseChange={(p, t) => {
                    setSelectedDetail((prev) =>
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
              ) : detailLoading ? (
                <div className="text-xs text-[#8b9bb4]">加载控制面板…</div>
              ) : null}

              <div className="flex items-center gap-3 pt-2 flex-wrap">
                <Link
                  href="/devices"
                  className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6]"
                >
                  设备管理
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
