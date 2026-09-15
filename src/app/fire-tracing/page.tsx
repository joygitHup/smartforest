'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Pagination, { usePagination } from '@/components/ui/pagination';
import { AuthGuard } from '@/components/auth-guard';
import { useRegionFilter } from '@/contexts/RegionFilterContext';
import {
  getFireTracings,
  getFireTracing,
  getFireTracingStatistics,
  downloadFireTracingReport,
} from '@/lib/api/alerts';
import { getDevices } from '@/lib/api/devices';
import type {
  ControlStrategy,
  FireTracing,
  FireTracingStatistics,
  SpreadPrediction,
  WeatherData,
} from '@/types/alert';
import type { FireMapDevice } from '@/components/fire-tracing/fire-situation-map';

const FireSituationMap = dynamic(
  () => import('@/components/fire-tracing/fire-situation-map'),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center text-xs text-[#8b9bb4]">
        地图加载中…
      </div>
    ),
  },
);

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: '进行中', color: 'text-[#ef4444]', bg: 'bg-[#ef4444]/10' },
  acknowledged: { label: '已确认', color: 'text-[#a78bfa]', bg: 'bg-[#a78bfa]/10' },
  dispatched: { label: '已派单', color: 'text-[#3b82f6]', bg: 'bg-[#3b82f6]/10' },
  processing: { label: '处置中', color: 'text-[#06b6d4]', bg: 'bg-[#06b6d4]/10' },
  escalated: { label: '已升级', color: 'text-[#ef4444]', bg: 'bg-[#ef4444]/10' },
  resolved: { label: '已扑灭', color: 'text-[#10b981]', bg: 'bg-[#10b981]/10' },
  false_alarm: { label: '误报', color: 'text-[#8b9bb4]', bg: 'bg-[#8b9bb4]/10' },
};

const WIND_DIRS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

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
  });
}

function toNumber(value?: number | string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function confidenceLabel(value?: number | null): string {
  if (value === null || value === undefined) return '-';
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  // 粗略映射定位精度文案
  if (pct >= 85) return `≤30m (${pct}%)`;
  if (pct >= 70) return `≤50m (${pct}%)`;
  return `≤100m (${pct}%)`;
}

function windText(weather?: WeatherData | null): string {
  if (!weather) return '-';
  const speed = weather.wind_speed;
  const dir = weather.wind_direction;
  let dirLabel = '';
  if (typeof dir === 'number') {
    const idx = Math.round((((dir % 360) + 360) % 360) / 45) % 8;
    dirLabel = `${WIND_DIRS[idx]}风`;
  } else if (typeof dir === 'string' && dir) {
    dirLabel = dir;
  }
  if (speed === undefined || speed === null) return dirLabel || '-';
  return `${dirLabel} ${speed}m/s`.trim();
}

function areaHectares(pred?: SpreadPrediction | null): string {
  if (!pred?.area_km2 && pred?.area_km2 !== 0) return '-';
  // 1 km² = 100 公顷
  return `${(Number(pred.area_km2) * 100).toFixed(1)}公顷`;
}

function deviceList(input?: string[] | unknown): string[] {
  if (Array.isArray(input)) {
    return input.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

function asStrategy(value: FireTracing['control_strategy']): ControlStrategy | null {
  if (!value || typeof value !== 'object') return null;
  return value as ControlStrategy;
}

function FireTracingPageContent() {
  const [items, setItems] = useState<FireTracing[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<FireTracingStatistics | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const { region, area } = useRegionFilter();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<FireTracing | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showSpread, setShowSpread] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [mapDevices, setMapDevices] = useState<FireMapDevice[]>([]);

  const { current, pageSize, onPageChange, onPageSizeChange } = usePagination(10);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getFireTracings({
        page: current,
        page_size: pageSize,
        search: search || undefined,
        alert_status: statusFilter === 'all' ? undefined : statusFilter,
        alert_level: levelFilter === 'all' ? undefined : levelFilter,
        forest_zone: region || undefined,
        region: area || undefined,
        ordering: '-created_at',
      });
      setItems(data.results);
      setTotalCount(data.count);
      if (data.results.length > 0) {
        setSelectedId((prev) => {
          if (prev && data.results.some((r) => r.id === prev)) return prev;
          return data.results[0].id;
        });
      } else {
        setSelectedId(null);
        setSelected(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载火情溯源列表失败');
      setItems([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [current, pageSize, search, statusFilter, levelFilter, region, area]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getFireTracingStatistics();
      setStats(data);
    } catch {
      // 统计失败不阻断列表
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (current !== 1) onPageChange(1);
  }, [region, area]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedId === null) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    getFireTracing(selectedId)
      .then((data) => {
        if (!cancelled) setSelected(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setActionMessage(err instanceof Error ? err.message : '加载详情失败');
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const devices = useMemo(
    () => deviceList(selected?.input_devices),
    [selected?.input_devices]
  );
  const weather = selected?.weather_data ?? null;
  const strategy = asStrategy(selected?.control_strategy ?? null);
  const lng = toNumber(selected?.origin_longitude);
  const lat = toNumber(selected?.origin_latitude);

  // 解析确认设备 / 消防设备为真实坐标点
  useEffect(() => {
    if (!selected) {
      setMapDevices([]);
      return;
    }
    let cancelled = false;
    const wanted = new Set<string>([
      ...devices,
      ...deviceList(strategy?.firefighting_devices),
    ]);
    if (selected.device_id) wanted.add(selected.device_id);

    void (async () => {
      try {
        const list = await getDevices({
          page: 1,
          page_size: 200,
          forest_zone: selected.forest_zone || undefined,
          region: selected.region || undefined,
        });
        if (cancelled) return;
        const matched = list.results
          .filter(
            (d) =>
              Number.isFinite(Number(d.longitude)) &&
              Number.isFinite(Number(d.latitude)) &&
              (wanted.size === 0 ||
                wanted.has(d.device_id) ||
                wanted.has(d.device_name)),
          )
          .map((d) => ({
            device_id: d.device_id,
            device_name: d.device_name,
            longitude: Number(d.longitude),
            latitude: Number(d.latitude),
            status: d.status,
          }));

        // 若按林区未命中 wanted，再退化为同林区全部有坐标设备（最多 12 台）
        const fallback =
          matched.length > 0
            ? matched
            : list.results
                .filter(
                  (d) =>
                    Number.isFinite(Number(d.longitude)) &&
                    Number.isFinite(Number(d.latitude)),
                )
                .slice(0, 12)
                .map((d) => ({
                  device_id: d.device_id,
                  device_name: d.device_name,
                  longitude: Number(d.longitude),
                  latitude: Number(d.latitude),
                  status: d.status,
                }));
        setMapDevices(fallback);
      } catch {
        if (!cancelled) setMapDevices([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected, devices, strategy]);

  const statusKey = selected?.alert_status || '';
  const statusMeta = statusConfig[statusKey] || {
    label: selected?.alert_status_display || statusKey || '-',
    color: 'text-[#8b9bb4]',
    bg: 'bg-[#8b9bb4]/10',
  };

  const affectedHa =
    selected?.affected_area_km2 != null
      ? (selected.affected_area_km2 * 100).toFixed(1)
      : selected?.spread_prediction_6h?.area_km2 != null
        ? (Number(selected.spread_prediction_6h.area_km2) * 100).toFixed(1)
        : '-';

  const handleSearch = () => {
    onPageChange(1);
    setSearch(searchInput.trim());
  };

  const handleReport = async () => {
    if (!selected) return;
    setReportLoading(true);
    setActionMessage('');
    try {
      await downloadFireTracingReport(selected.id);
      setActionMessage('报告已下载');
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : '生成报告失败');
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
        <h1 className="text-lg font-semibold text-[#e8f1ff]">火情溯源与蔓延推演</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowSpread(!showSpread)}
            disabled={!selected}
            className={`px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-40 ${
              showSpread
                ? 'bg-[#ef4444] text-white'
                : 'border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#ef4444] hover:text-[#ef4444]'
            }`}
          >
            {showSpread ? '关闭推演' : '启动蔓延推演'}
          </button>
          <button
            type="button"
            onClick={() => void handleReport()}
            disabled={!selected || reportLoading}
            className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors disabled:opacity-40"
          >
            {reportLoading ? '生成中…' : '生成报告'}
          </button>
          <button
            type="button"
            onClick={() => {
              void fetchList();
              void fetchStats();
            }}
            className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors"
          >
            刷新
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
          {[
            { label: '溯源记录', value: stats.total, color: 'text-[#e8f1ff]' },
            { label: '进行中', value: stats.active_count, color: 'text-[#ef4444]' },
            { label: '已处置', value: stats.resolved_count, color: 'text-[#10b981]' },
            {
              label: '平均置信度',
              value: `${Math.round(stats.avg_confidence * 100)}%`,
              color: 'text-[#3b82f6]',
            },
          ].map((card) => (
            <div
              key={card.label}
              className="bg-[#152238] border border-[#1e3a5f] rounded-lg px-4 py-3"
            >
              <div className="text-[10px] text-[#8b9bb4] mb-1">{card.label}</div>
              <div className={`text-xl font-mono ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch();
          }}
          placeholder="搜索告警编号 / 标题 / 区域 / 设备"
          className="h-8 w-56 max-w-full rounded border border-[#1e3a5f] bg-[#0a1628] px-3 text-xs text-[#e8f1ff] placeholder:text-[#5a6a82] outline-none focus:border-[#3b82f6]"
        />
        <button
          type="button"
          onClick={handleSearch}
          className="h-8 px-3 text-xs rounded border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6]"
        >
          搜索
        </button>
        <select
          value={statusFilter}
          onChange={(e) => {
            onPageChange(1);
            setStatusFilter(e.target.value);
          }}
          className="h-8 rounded border border-[#1e3a5f] bg-[#0a1628] px-2 text-xs text-[#e8f1ff] outline-none"
        >
          <option value="all">全部状态</option>
          <option value="new">待处理</option>
          <option value="processing">处置中</option>
          <option value="resolved">已处置</option>
          <option value="false_alarm">误报</option>
          <option value="escalated">已升级</option>
        </select>
        <select
          value={levelFilter}
          onChange={(e) => {
            onPageChange(1);
            setLevelFilter(e.target.value);
          }}
          className="h-8 rounded border border-[#1e3a5f] bg-[#0a1628] px-2 text-xs text-[#e8f1ff] outline-none"
        >
          <option value="all">全部级别</option>
          <option value="level_1">一级</option>
          <option value="level_2">二级</option>
          <option value="level_3">三级</option>
        </select>
        {actionMessage && (
          <span className="text-[11px] text-[#3b82f6]">{actionMessage}</span>
        )}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 min-h-0 items-stretch">
        {/* 左侧列表：高度与右侧地图+分析区对齐 */}
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg flex flex-col overflow-hidden min-h-0 self-stretch">
          <div className="px-4 py-2 border-b border-[#1e3a5f] flex items-center justify-between shrink-0">
            <span className="text-xs text-[#8b9bb4]">历史火情记录</span>
            <span className="text-[10px] text-[#5a6a82] font-mono">{totalCount}</span>
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            {loading && (
              <div className="px-4 py-8 text-center text-xs text-[#8b9bb4]">加载中…</div>
            )}
            {!loading && error && (
              <div className="px-4 py-8 text-center text-xs text-[#ef4444]">{error}</div>
            )}
            {!loading && !error && items.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-[#8b9bb4]">暂无溯源记录</div>
            )}
            {!loading &&
              items.map((event) => {
                const meta = statusConfig[event.alert_status || ''] || {
                  label: event.alert_status_display || '-',
                  color: 'text-[#8b9bb4]',
                  bg: 'bg-[#8b9bb4]/10',
                };
                const area =
                  event.affected_area_km2 != null
                    ? (event.affected_area_km2 * 100).toFixed(1)
                    : '-';
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedId(event.id)}
                    className={`w-full text-left px-4 py-3 border-b border-[#1e3a5f]/50 hover:bg-[#1a2d4a] transition-colors ${
                      selectedId === event.id
                        ? 'bg-[#1a2d4a] border-l-2 border-l-[#3b82f6]'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <span className="text-xs text-[#e8f1ff] font-medium truncate">
                        {event.alert_title || event.alert_id || `溯源#${event.id}`}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${meta.bg} ${meta.color}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#8b9bb4] font-mono">
                      {event.alert_id} · {formatTime(event.occurred_at || event.created_at)}
                    </div>
                    <div className="text-[10px] text-[#8b9bb4] mt-1">
                      过火面积: {area}公顷
                      {event.region ? ` · ${event.region}` : ''}
                    </div>
                  </button>
                );
              })}
          </div>
          <div className="border-t border-[#1e3a5f] shrink-0 mt-auto">
            <Pagination
              compact
              current={current}
              pageSize={pageSize}
              total={totalCount}
              pageSizeOptions={[10, 20, 50]}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </div>
        </div>

        {/* 右侧：态势图 + 分析卡片 */}
        <div className="flex flex-col gap-4 min-h-0 self-stretch overflow-hidden">
          <div className="flex-1 min-h-0 bg-[#152238] border border-[#1e3a5f] rounded-lg flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e3a5f] shrink-0">
              <span className="text-xs text-[#8b9bb4]">火情态势图</span>
              <div className="flex items-center gap-2 text-[10px] text-[#8b9bb4]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
                  起火点
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                  蔓延范围
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                  隔离带
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                  设备
                </span>
              </div>
            </div>
            <div className="flex-1 relative bg-[#0f1e35] overflow-hidden min-h-0">
              <FireSituationMap
                tracing={selected}
                devices={mapDevices}
                showSpread={showSpread}
                loading={detailLoading}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
              <div className="text-[10px] text-[#8b9bb4] mb-2">起火点溯源</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">估算坐标</span>
                  <span className="text-[#e8f1ff] font-mono text-right">
                    {lng != null ? `E${lng.toFixed(4)}°` : '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">纬度</span>
                  <span className="text-[#e8f1ff] font-mono">
                    {lat != null ? `N${lat.toFixed(4)}°` : '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">定位精度</span>
                  <span className="text-[#10b981] font-mono">
                    {confidenceLabel(selected?.origin_confidence)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">确认设备</span>
                  <span className="text-[#e8f1ff] font-mono">{devices.length}台</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">起始时间</span>
                  <span className="text-[#e8f1ff] font-mono">
                    {formatTime(selected?.occurred_at || selected?.created_at)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">告警状态</span>
                  <span className={`${statusMeta.color}`}>{statusMeta.label}</span>
                </div>
              </div>
            </div>

            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
              <div className="text-[10px] text-[#8b9bb4] mb-2">气象条件</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">风向风速</span>
                  <span className="text-[#e8f1ff]">{windText(weather)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">环境温度</span>
                  <span className="text-[#e8f1ff] font-mono">
                    {weather?.temperature != null ? `${weather.temperature}℃` : '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">相对湿度</span>
                  <span className="text-[#e8f1ff] font-mono">
                    {weather?.humidity != null ? `${weather.humidity}%` : '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">关联设备</span>
                  <span className="text-[#e8f1ff] truncate max-w-[60%] text-right font-mono">
                    {devices.slice(0, 3).join(', ') || '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">区域</span>
                  <span className="text-[#e8f1ff]">
                    {selected?.region || selected?.forest_zone || '-'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
              <div className="text-[10px] text-[#8b9bb4] mb-2">
                蔓延预测({selected?.algorithm || 'FARSITE'})
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">1小时后</span>
                  <span className="text-[#f59e0b] font-mono">
                    {areaHectares(selected?.spread_prediction_1h)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">3小时后</span>
                  <span className="text-[#f59e0b] font-mono">
                    {areaHectares(selected?.spread_prediction_3h)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">6小时后</span>
                  <span className="text-[#ef4444] font-mono">
                    {areaHectares(selected?.spread_prediction_6h)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b9bb4]">当前面积</span>
                  <span className="text-[#e8f1ff] font-mono">{affectedHa}公顷</span>
                </div>
                {strategy?.firefighting_devices && (
                  <div className="flex justify-between gap-2">
                    <span className="text-[#8b9bb4]">灭火设备</span>
                    <span className="text-[#e8f1ff] truncate max-w-[60%] text-right font-mono">
                      {strategy.firefighting_devices.slice(0, 2).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FireTracingPage() {
  return (
    <AuthGuard>
      <FireTracingPageContent />
    </AuthGuard>
  );
}
