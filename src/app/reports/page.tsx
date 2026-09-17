'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import Pagination, { usePagination } from '@/components/ui/pagination';
import {
  exportDailyReport,
  generateDailyReport,
  getAlertAnalysis,
  getDailyReportByDate,
  getDailyReports,
  getDeviceStatistics,
  getDeviceStatisticsSummary,
  getEnvironmentalDailySummary,
} from '@/lib/api/reports';
import type {
  AlertAnalysis,
  DailyReport,
  DeviceStatistic,
  DeviceStatisticsSummary,
  EnvironmentalDailySummary,
} from '@/types/report';

type ReportTab = 'daily' | 'device' | 'alert' | 'environment';

const TYPE_COLORS = ['bg-[#ef4444]', 'bg-[#f59e0b]', 'bg-[#06b6d4]', 'bg-[#3b82f6]', 'bg-[#8b9bb4]', 'bg-[#10b981]'];
const DEVICE_TYPE_COLORS = ['#3b82f6', '#10b981', '#06b6d4', '#f59e0b'];

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatResponseTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '-';
  if (seconds < 60) return `${seconds}秒`;
  const mins = seconds / 60;
  if (mins < 60) return `${mins.toFixed(1)}分钟`;
  return `${(mins / 60).toFixed(1)}小时`;
}

function num(value?: number | null, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return Number(value).toFixed(digits);
}

function ReportsPageContent() {
  const [activeTab, setActiveTab] = useState<ReportTab>('daily');
  const [reportDate, setReportDate] = useState(todayStr);
  const [dateOptions, setDateOptions] = useState<string[]>([todayStr()]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [daily, setDaily] = useState<DailyReport | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [alertAnalysis, setAlertAnalysis] = useState<AlertAnalysis | null>(null);

  const [deviceSummary, setDeviceSummary] = useState<DeviceStatisticsSummary | null>(null);
  const [deviceRows, setDeviceRows] = useState<DeviceStatistic[]>([]);
  const [deviceTotal, setDeviceTotal] = useState(0);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const devicePager = usePagination(10);

  const [envSummary, setEnvSummary] = useState<EnvironmentalDailySummary | null>(null);
  const [envLoading, setEnvLoading] = useState(false);

  const tabs: { key: ReportTab; label: string }[] = [
    { key: 'daily', label: '日报概览' },
    { key: 'device', label: '设备统计' },
    { key: 'alert', label: '告警分析' },
    { key: 'environment', label: '环境数据' },
  ];

  const loadDateOptions = useCallback(async () => {
    try {
      const data = await getDailyReports({ page: 1, page_size: 30, ordering: '-report_date' });
      const dates = data.results.map((r) => r.report_date);
      const merged = Array.from(new Set([reportDate, todayStr(), ...dates]));
      setDateOptions(merged);
    } catch {
      setDateOptions((prev) => Array.from(new Set([reportDate, todayStr(), ...prev])));
    }
  }, [reportDate]);

  const loadDaily = useCallback(async () => {
    setDailyLoading(true);
    setMessage('');
    try {
      const [reportResult, analysisResult] = await Promise.allSettled([
        getDailyReportByDate(reportDate),
        getAlertAnalysis({ report_date: reportDate }),
      ]);

      if (reportResult.status === 'fulfilled') {
        setDaily(reportResult.value);
      } else {
        setDaily(null);
      }

      if (analysisResult.status === 'fulfilled') {
        setAlertAnalysis(analysisResult.value);
      } else {
        setAlertAnalysis(null);
      }

      if (activeTab === 'alert') {
        const analysis =
          analysisResult.status === 'fulfilled' ? analysisResult.value : null;
        if (!analysis || analysis.total === 0) {
          setMessage(`${reportDate} 暂无告警，数据来自本组织告警表`);
        }
      } else if (reportResult.status !== 'fulfilled') {
        setMessage(`${reportDate} 尚无日报，可点击「生成报表」`);
      }
    } catch (err) {
      setDaily(null);
      setAlertAnalysis(null);
      setMessage(err instanceof Error ? err.message : '加载日报失败');
    } finally {
      setDailyLoading(false);
    }
  }, [reportDate, activeTab]);

  const loadDevices = useCallback(async () => {
    setDeviceLoading(true);
    try {
      const [summary, list] = await Promise.all([
        getDeviceStatisticsSummary({ stat_date: reportDate }),
        getDeviceStatistics({
          stat_date: reportDate,
          page: devicePager.current,
          page_size: devicePager.pageSize,
          ordering: '-alert_count',
        }),
      ]);
      setDeviceSummary(summary);
      setDeviceRows(list.results);
      setDeviceTotal(list.count);
      if (list.count === 0) {
        setMessage(`${reportDate} 尚无设备统计，可点击「生成报表」`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '加载设备统计失败');
    } finally {
      setDeviceLoading(false);
    }
  }, [reportDate, devicePager.current, devicePager.pageSize]);

  const loadEnv = useCallback(async () => {
    setEnvLoading(true);
    setMessage('');
    try {
      const data = await getEnvironmentalDailySummary({ stat_date: reportDate });
      setEnvSummary(data);
      if (data.record_count === 0) {
        setMessage(
          `${reportDate} 尚无环境汇总。请先有设备遥测入库，再点「生成报表」（来源：DeviceTelemetry）`
        );
      } else {
        setMessage('');
      }
    } catch (err) {
      setEnvSummary(null);
      setMessage(err instanceof Error ? err.message : '加载环境数据失败');
    } finally {
      setEnvLoading(false);
    }
  }, [reportDate]);

  useEffect(() => {
    void loadDateOptions();
  }, [loadDateOptions]);

  useEffect(() => {
    if (activeTab === 'daily' || activeTab === 'alert') {
      void loadDaily();
    } else if (activeTab === 'device') {
      void loadDevices();
    } else if (activeTab === 'environment') {
      void loadEnv();
    }
  }, [activeTab, loadDaily, loadDevices, loadEnv]);

  const handleGenerate = async () => {
    setBusy(true);
    setMessage('正在生成报表（环境→设备→日报）…');
    try {
      const result = await generateDailyReport({
        report_date: reportDate,
        force: true,
        sync: true,
        full: true,
      });
      setMessage(result.message || '报表生成完成');
      await loadDateOptions();
      if (activeTab === 'device') await loadDevices();
      else if (activeTab === 'environment') await loadEnv();
      else await loadDaily();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '生成失败');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      if (daily?.id) {
        await exportDailyReport({ id: daily.id, report_date: reportDate });
      } else {
        await exportDailyReport({ report_date: reportDate });
      }
      setMessage('CSV 已下载');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '导出失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-[#e8f1ff]">报表中心</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-sm text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
          />
          <select
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-sm text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] max-w-[160px]"
          >
            {dateOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleGenerate()}
            className="px-3 py-1.5 text-sm border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] disabled:opacity-50"
          >
            {busy ? '处理中…' : '生成报表'}
          </button>
          <button
            type="button"
            disabled={busy || !daily}
            onClick={() => void handleExport()}
            className="px-3 py-1.5 text-sm bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors disabled:opacity-50"
          >
            导出 CSV
          </button>
        </div>
      </div>

      {message && (
        <div className="text-[11px] text-[#93c5fd] bg-[#3b82f6]/10 border border-[#3b82f6]/30 rounded px-3 py-2">
          {message}
        </div>
      )}

      <div className="flex items-center gap-1 bg-[#0f1e35] border border-[#1e3a5f] rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 text-sm rounded transition-colors ${
              activeTab === tab.key
                ? 'bg-[#3b82f6] text-white'
                : 'text-[#8b9bb4] hover:text-[#e8f1ff]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {activeTab === 'daily' && (
          <DailyReportPanel
            daily={daily}
            loading={dailyLoading}
            analysis={alertAnalysis}
          />
        )}
        {activeTab === 'device' && (
          <DeviceReportPanel
            summary={deviceSummary}
            rows={deviceRows}
            total={deviceTotal}
            loading={deviceLoading}
            current={devicePager.current}
            pageSize={devicePager.pageSize}
            onPageChange={devicePager.onPageChange}
            onPageSizeChange={devicePager.onPageSizeChange}
          />
        )}
        {activeTab === 'alert' && (
          <AlertReportPanel analysis={alertAnalysis} loading={dailyLoading} />
        )}
        {activeTab === 'environment' && (
          <EnvironmentReportPanel summary={envSummary} loading={envLoading} />
        )}
      </div>
    </div>
  );
}

function DailyReportPanel({
  daily,
  loading,
  analysis,
}: {
  daily: DailyReport | null;
  loading: boolean;
  analysis: AlertAnalysis | null;
}) {
  if (loading) {
    return <div className="text-sm text-[#8b9bb4] py-8 text-center">加载日报…</div>;
  }
  if (!daily) {
    return (
      <div className="text-sm text-[#8b9bb4] py-8 text-center">
        暂无该日日报数据，请点击右上角「生成报表」
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="在线设备率"
          value={`${num(daily.online_rate, 1)}%`}
          color="text-[#10b981]"
          sub={`${daily.online_devices}/${daily.total_devices} 台`}
        />
        <KpiCard
          label="告警处理率"
          value={`${num(daily.resolution_rate, 1)}%`}
          color="text-[#3b82f6]"
          sub={`${daily.resolved_alerts}/${daily.total_alerts} 已处理`}
        />
        <KpiCard
          label="平均响应时间"
          value={formatResponseTime(daily.avg_response_time)}
          color="text-[#06b6d4]"
          sub={`${daily.avg_response_time} 秒`}
        />
        <KpiCard
          label="误报率"
          value={`${num(daily.false_alarm_rate, 1)}%`}
          color="text-[#f59e0b]"
          sub={`误报 ${daily.false_alarm_count} 次 · 碳汇 ${num(daily.carbon_sequestration, 2)}吨`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-sm text-[#8b9bb4] mb-3">告警类型分布</div>
          <div className="space-y-2">
            {(analysis?.by_type || []).length === 0 && (
              <div className="text-[11px] text-[#8b9bb4]">当日无告警</div>
            )}
            {(analysis?.by_type || []).slice(0, 6).map((item, idx) => (
              <div key={item.alert_type} className="flex items-center gap-3">
                <span className="text-sm text-[#8b9bb4] w-16 truncate">{item.label}</span>
                <div className="flex-1 h-2 bg-[#0f1e35] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${TYPE_COLORS[idx % TYPE_COLORS.length]}`}
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
                <span className="text-sm text-[#e8f1ff] font-mono w-8 text-right">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-sm text-[#8b9bb4] mb-3">林区告警排名</div>
          <div className="space-y-2">
            {(analysis?.by_zone || []).length === 0 && (
              <div className="text-[11px] text-[#8b9bb4]">暂无林区数据</div>
            )}
            {(analysis?.by_zone || []).map((item, idx) => (
              <div key={item.forest_zone} className="flex items-center gap-3">
                <span
                  className={`text-sm font-mono w-4 ${idx < 2 ? 'text-[#ef4444]' : 'text-[#8b9bb4]'}`}
                >
                  {idx + 1}
                </span>
                <span className="text-sm text-[#e8f1ff] flex-1 truncate">{item.forest_zone}</span>
                <span
                  className={`text-sm font-mono ${
                    item.level === 'high'
                      ? 'text-[#ef4444]'
                      : item.level === 'medium'
                        ? 'text-[#f59e0b]'
                        : 'text-[#8b9bb4]'
                  }`}
                >
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

function DeviceReportPanel({
  summary,
  rows,
  total,
  loading,
  current,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  summary: DeviceStatisticsSummary | null;
  rows: DeviceStatistic[];
  total: number;
  loading: boolean;
  current: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="设备可用率"
          value={`${num(summary?.avg_availability, 1)}%`}
          color="text-[#10b981]"
        />
        <KpiCard
          label="平均在线时长"
          value={
            <>
              {num(summary?.avg_uptime_hours, 1)}
              <span className="text-sm">h</span>
            </>
          }
          color="text-[#3b82f6]"
        />
        <KpiCard
          label="故障设备"
          value={
            <>
              {summary?.fault_device_count ?? 0}
              <span className="text-sm">台</span>
            </>
          }
          color="text-[#ef4444]"
          sub={`故障次数合计 ${summary?.total_faults ?? 0}`}
        />
      </div>

      <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
        <div className="text-sm text-[#8b9bb4] mb-3">设备类型分布</div>
        {loading && <div className="text-[11px] text-[#8b9bb4]">加载中…</div>}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(summary?.type_distribution || []).map((item, idx) => {
            const color = DEVICE_TYPE_COLORS[idx % DEVICE_TYPE_COLORS.length];
            const rate = item.count ? (item.online / item.count) * 100 : 0;
            return (
              <div key={item.device_type} className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                <div className="text-sm text-[#8b9bb4] mb-2">{item.label}</div>
                <div className="text-xl font-bold font-mono" style={{ color }}>
                  {item.count}
                </div>
                <div className="text-[10px] text-[#8b9bb4] mt-1">在线 {item.online} 台</div>
                <div className="w-full h-1 bg-[#1e3a5f] rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${rate}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-[#1e3a5f] text-sm text-[#8b9bb4]">
          当日设备明细
        </div>
        <div className="overflow-auto">
          <table className="w-full">
            <thead className="bg-[#0f1e35]">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">设备</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">可用率</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">在线时长</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">告警</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">故障</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">完整率</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-[#8b9bb4]">
                    暂无明细，请先生成报表
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#1e3a5f]/50">
                  <td className="px-4 py-3 text-sm text-[#e8f1ff]">
                    <div>{row.device_name}</div>
                    <div className="text-[10px] text-[#8b9bb4] font-mono">{row.device_id}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#10b981] font-mono">
                    {num(row.availability_rate, 1)}%
                  </td>
                  <td className="px-4 py-3 text-sm text-[#e8f1ff] font-mono">
                    {num(row.uptime_hours, 1)}h
                  </td>
                  <td className="px-4 py-3 text-sm text-[#e8f1ff] font-mono">{row.alert_count}</td>
                  <td className="px-4 py-3 text-sm text-[#ef4444] font-mono">{row.fault_count}</td>
                  <td className="px-4 py-3 text-sm text-[#e8f1ff] font-mono">
                    {num(row.data_completeness, 1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#1e3a5f] p-2">
          <Pagination
            current={current}
            pageSize={pageSize}
            total={total}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </div>
      </div>
    </div>
  );
}

function AlertReportPanel({
  analysis,
  loading,
}: {
  analysis: AlertAnalysis | null;
  loading: boolean;
}) {
  const hourly = analysis?.hourly || Array.from({ length: 24 }, () => 0);
  const hourlyMax = Math.max(1, ...hourly);
  const byType = analysis?.by_type || [];
  const byZone = analysis?.by_zone || [];
  const byRegion = analysis?.by_region || [];
  const byStatus = analysis?.by_status || [];
  const topDevices = analysis?.top_devices || [];

  if (loading) {
    return <div className="text-sm text-[#8b9bb4] py-8 text-center">加载告警分析…</div>;
  }

  if (!analysis || analysis.total === 0) {
    return (
      <div className="text-sm text-[#8b9bb4] py-12 text-center space-y-2">
        <div>当日暂无告警数据</div>
        <div className="text-[10px]">
          数据来源：告警表 Alert（规则引擎 / MQTT 告警入库），切换日期或产生告警后刷新
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-[10px] text-[#8b9bb4]">
        数据来源：{analysis.source || 'alerts'} · 统计周期 {analysis.period} · 合计{' '}
        {analysis.total} 条
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="告警总数"
          value={String(analysis.total)}
          color="text-[#ef4444]"
          sub={`未闭环 ${analysis.open_count ?? 0} · 已闭环 ${analysis.closed_count ?? 0}`}
        />
        <KpiCard
          label="处理率"
          value={`${num(analysis.resolution_rate, 1)}%`}
          color="text-[#10b981]"
          sub={`已处置 ${analysis.resolved_count ?? 0} · 误报 ${analysis.false_alarm_count ?? 0}`}
        />
        <KpiCard
          label="误报率"
          value={`${num(analysis.false_alarm_rate, 1)}%`}
          color="text-[#f59e0b]"
          sub={`误报 ${analysis.false_alarm_count ?? 0} 次`}
        />
        <KpiCard
          label="平均响应时间"
          value={formatResponseTime(analysis.avg_response_seconds || 0)}
          color="text-[#06b6d4]"
          sub={`${analysis.avg_response_seconds ?? 0} 秒`}
        />
      </div>

      <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="text-sm text-[#8b9bb4]">当日告警小时趋势</div>
          <div className="text-[10px] text-[#8b9bb4] font-mono">
            峰值 {hourlyMax} 次/时 · 合计 {hourly.reduce((a, b) => a + b, 0)} 次
          </div>
        </div>
        <div className="h-44 flex items-end gap-0.5">
          {hourly.map((val, i) => {
            const height = val <= 0 ? 4 : Math.max(8, (val / hourlyMax) * 100);
            const isPeak = val > 0 && val / hourlyMax > 0.7;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full h-36 flex items-end justify-center">
                  <div
                    className={`w-full max-w-[14px] rounded-t ${
                      val <= 0
                        ? 'bg-[#1e3a5f]/80'
                        : isPeak
                          ? 'bg-[#ef4444]/70'
                          : 'bg-[#3b82f6]/70'
                    }`}
                    style={{ height: `${height}%` }}
                    title={`${i}:00 · ${val}次`}
                  />
                </div>
                {i % 4 === 0 && <span className="text-[9px] text-[#8b9bb4]">{i}:00</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden">
        <div className="px-4 py-3 text-sm text-[#8b9bb4] border-b border-[#1e3a5f]/50">
          告警等级分析
        </div>
        <table className="w-full">
          <thead className="bg-[#0f1e35]">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">告警等级</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">总数</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">未闭环</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">已处理</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">误报</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">处理率</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">平均响应</th>
            </tr>
          </thead>
          <tbody>
            {(analysis.by_level || []).map((stat) => (
              <tr key={stat.level} className="border-t border-[#1e3a5f]/50">
                <td className="px-4 py-3 text-sm text-[#e8f1ff]">{stat.label}</td>
                <td className="px-4 py-3 text-sm text-[#e8f1ff] font-mono">{stat.total}</td>
                <td className="px-4 py-3 text-sm text-[#f59e0b] font-mono">{stat.open ?? 0}</td>
                <td className="px-4 py-3 text-sm text-[#10b981] font-mono">{stat.resolved}</td>
                <td className="px-4 py-3 text-sm text-[#8b9bb4] font-mono">{stat.false_alarm ?? 0}</td>
                <td className="px-4 py-3 text-sm text-[#e8f1ff] font-mono">
                  {num(stat.resolution_rate, 1)}%
                </td>
                <td className="px-4 py-3 text-sm text-[#e8f1ff] font-mono">
                  {formatResponseTime(stat.avg_response_seconds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-sm text-[#8b9bb4] mb-3">告警类型分布</div>
          <div className="space-y-2">
            {byType.length === 0 && <div className="text-[11px] text-[#8b9bb4]">暂无类型数据</div>}
            {byType.map((item, idx) => (
              <div key={item.alert_type} className="flex items-center gap-3">
                <span className="text-sm text-[#8b9bb4] w-16 truncate">{item.label}</span>
                <div className="flex-1 h-2 bg-[#0f1e35] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${TYPE_COLORS[idx % TYPE_COLORS.length]}`}
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
                <span className="text-sm text-[#e8f1ff] font-mono w-12 text-right">
                  {item.count}
                </span>
                <span className="text-[10px] text-[#8b9bb4] font-mono w-10 text-right">
                  {num(item.pct, 0)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-sm text-[#8b9bb4] mb-3">告警状态分布</div>
          <div className="space-y-2">
            {byStatus.length === 0 && <div className="text-[11px] text-[#8b9bb4]">暂无状态数据</div>}
            {byStatus.map((item, idx) => (
              <div key={item.status} className="flex items-center gap-3">
                <span className="text-sm text-[#8b9bb4] w-16 truncate">{item.label}</span>
                <div className="flex-1 h-2 bg-[#0f1e35] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${TYPE_COLORS[idx % TYPE_COLORS.length]}`}
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
                <span className="text-sm text-[#e8f1ff] font-mono w-12 text-right">
                  {item.count}
                </span>
                <span className="text-[10px] text-[#8b9bb4] font-mono w-10 text-right">
                  {num(item.pct, 0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-sm text-[#8b9bb4] mb-3">林区告警排名</div>
          <div className="space-y-2">
            {byZone.length === 0 && <div className="text-[11px] text-[#8b9bb4]">暂无林区数据</div>}
            {byZone.map((item, idx) => (
              <div key={item.forest_zone} className="flex items-center gap-3">
                <span
                  className={`text-sm font-mono w-4 ${idx < 2 ? 'text-[#ef4444]' : 'text-[#8b9bb4]'}`}
                >
                  {idx + 1}
                </span>
                <span className="text-sm text-[#e8f1ff] flex-1 truncate">{item.forest_zone}</span>
                <span
                  className={`text-sm font-mono ${
                    item.level === 'high'
                      ? 'text-[#ef4444]'
                      : item.level === 'medium'
                        ? 'text-[#f59e0b]'
                        : 'text-[#10b981]'
                  }`}
                >
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
          <div className="text-sm text-[#8b9bb4] mb-3">区域告警排名</div>
          <div className="space-y-2">
            {byRegion.length === 0 && <div className="text-[11px] text-[#8b9bb4]">暂无区域数据</div>}
            {byRegion.map((item, idx) => (
              <div key={item.region} className="flex items-center gap-3">
                <span
                  className={`text-sm font-mono w-4 ${idx < 2 ? 'text-[#ef4444]' : 'text-[#8b9bb4]'}`}
                >
                  {idx + 1}
                </span>
                <span className="text-sm text-[#e8f1ff] flex-1 truncate">{item.region}</span>
                <span
                  className={`text-sm font-mono ${
                    item.level === 'high'
                      ? 'text-[#ef4444]'
                      : item.level === 'medium'
                        ? 'text-[#f59e0b]'
                        : 'text-[#10b981]'
                  }`}
                >
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden">
        <div className="px-4 py-3 text-sm text-[#8b9bb4] border-b border-[#1e3a5f]/50">
          告警设备 TOP
        </div>
        <table className="w-full">
          <thead className="bg-[#0f1e35]">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">#</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">设备 ID</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">设备名称</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-[#8b9bb4]">告警数</th>
            </tr>
          </thead>
          <tbody>
            {topDevices.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-[#8b9bb4]">
                  暂无关联设备告警
                </td>
              </tr>
            )}
            {topDevices.map((row, idx) => (
              <tr key={`${row.device_id}-${idx}`} className="border-t border-[#1e3a5f]/50">
                <td className="px-4 py-3 text-sm text-[#8b9bb4] font-mono">{idx + 1}</td>
                <td className="px-4 py-3 text-sm text-[#e8f1ff] font-mono">{row.device_id}</td>
                <td className="px-4 py-3 text-sm text-[#e8f1ff]">{row.device_name}</td>
                <td className="px-4 py-3 text-sm text-[#ef4444] font-mono">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EnvironmentReportPanel({
  summary,
  loading,
}: {
  summary: EnvironmentalDailySummary | null;
  loading: boolean;
}) {
  const s = summary?.summary;
  const hourly = summary?.hourly || [];
  const regions = summary?.by_region || [];
  const temps = hourly
    .map((h) => h.avg_temperature)
    .filter((t): t is number => t !== null && t !== undefined);
  const tempMax = Math.max(1, ...temps, s?.max_temperature || 0, 1);
  const tempMin = Math.min(...(temps.length ? temps : [0]), s?.min_temperature ?? 0);
  const tempSpan = Math.max(1, tempMax - tempMin);

  if (loading) {
    return <div className="text-sm text-[#8b9bb4] py-8 text-center">加载环境数据…</div>;
  }

  if (!summary || summary.record_count === 0) {
    return (
      <div className="text-sm text-[#8b9bb4] py-12 text-center space-y-2">
        <div>当日暂无环境汇总</div>
        <div className="text-[10px]">
          数据来源：设备遥测 DeviceTelemetry（MQTT/Kafka 入库）→ 点击上方「生成报表」汇总
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-[10px] text-[#8b9bb4]">
        数据来源：{summary.source || 'device_telemetry → environmental_data'} · 记录{' '}
        {summary.record_count} 条 · {summary.stat_date}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          label="日均温度"
          value={
            <>
              {num(s?.avg_temperature, 1)}
              <span className="text-sm">℃</span>
            </>
          }
          color="text-[#f59e0b]"
          sub={`最高 ${num(s?.max_temperature, 1)}℃ / 最低 ${num(s?.min_temperature, 1)}℃`}
        />
        <KpiCard
          label="日均湿度"
          value={
            <>
              {num(s?.avg_humidity, 1)}
              <span className="text-sm">%RH</span>
            </>
          }
          color="text-[#3b82f6]"
          sub={`最高 ${num(s?.max_humidity, 0)}% / 最低 ${num(s?.min_humidity, 0)}%`}
        />
        <KpiCard
          label="日均风速"
          value={
            <>
              {num(s?.avg_wind_speed, 1)}
              <span className="text-sm">m/s</span>
            </>
          }
          color="text-[#06b6d4]"
          sub={`最大 ${num(s?.max_wind_speed, 1)}m/s`}
        />
        <KpiCard
          label="平均土壤湿度"
          value={
            <>
              {num(s?.avg_soil_moisture, 1)}
              <span className="text-sm">%</span>
            </>
          }
          color="text-[#10b981]"
          sub="10cm 土壤湿度均值"
        />
        <KpiCard
          label="可燃物含水率"
          value={
            <>
              {num(s?.avg_fuel_moisture, 1)}
              <span className="text-sm">%</span>
            </>
          }
          color="text-[#a78bfa]"
          sub="火险相关指标"
        />
        <KpiCard
          label="平均光照"
          value={
            <>
              {num(s?.avg_light_intensity, 0)}
              <span className="text-sm">lux</span>
            </>
          }
          color="text-[#e8f1ff]"
          sub="可见光强度"
        />
      </div>

      <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="text-sm text-[#8b9bb4]">温湿度变化（按小时）</div>
          <div className="flex items-center gap-3 text-[10px] text-[#8b9bb4]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-[#f59e0b]/80" />
              温度 ℃
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-[#3b82f6]/80" />
              湿度 %RH
            </span>
          </div>
        </div>
        <div className="h-44 flex items-end gap-0.5">
          {Array.from({ length: 24 }, (_, hour) => {
            const point = hourly.find((h) => Number(h.stat_hour) === hour);
            const t = point?.avg_temperature;
            const hVal = point?.avg_humidity;
            const tempHeight =
              t === null || t === undefined ? 4 : Math.max(4, ((t - tempMin) / tempSpan) * 100);
            const humHeight =
              hVal === null || hVal === undefined ? 4 : Math.max(4, Math.min(100, hVal));
            return (
              <div key={hour} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full h-36 flex items-end justify-center gap-px">
                  <div
                    className="flex-1 max-w-[10px] rounded-t bg-[#f59e0b]/70"
                    style={{ height: `${tempHeight}%` }}
                    title={`${hour}:00 温度 ${t ?? '-'}℃`}
                  />
                  <div
                    className="flex-1 max-w-[10px] rounded-t bg-[#3b82f6]/70"
                    style={{ height: `${humHeight}%` }}
                    title={`${hour}:00 湿度 ${hVal ?? '-'}%`}
                  />
                </div>
                {hour % 4 === 0 && (
                  <span className="text-[9px] text-[#8b9bb4]">{hour}:00</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e3a5f] text-sm text-[#8b9bb4]">
          分林区环境汇总
        </div>
        {regions.length === 0 ? (
          <div className="text-sm text-[#8b9bb4] py-8 text-center">暂无分区数据</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-[#0c1a2e] text-[#8b9bb4]">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">林区</th>
                  <th className="text-left font-medium px-4 py-2.5">均温℃</th>
                  <th className="text-left font-medium px-4 py-2.5">最高/最低</th>
                  <th className="text-left font-medium px-4 py-2.5">湿度%RH</th>
                  <th className="text-left font-medium px-4 py-2.5">风速m/s</th>
                  <th className="text-left font-medium px-4 py-2.5">土壤湿度%</th>
                  <th className="text-left font-medium px-4 py-2.5">可燃物%</th>
                  <th className="text-left font-medium px-4 py-2.5">光照</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => (
                  <tr
                    key={r.region}
                    className="border-t border-[#1e3a5f]/60 hover:bg-[#0f1e35]/50"
                  >
                    <td className="px-4 py-2.5 text-[#e8f1ff]">{r.region}</td>
                    <td className="px-4 py-2.5 text-[#f59e0b] font-mono">
                      {num(r.avg_temperature, 1)}
                    </td>
                    <td className="px-4 py-2.5 text-[#8b9bb4] font-mono">
                      {num(r.max_temperature, 1)} / {num(r.min_temperature, 1)}
                    </td>
                    <td className="px-4 py-2.5 text-[#3b82f6] font-mono">
                      {num(r.avg_humidity, 1)}
                    </td>
                    <td className="px-4 py-2.5 text-[#06b6d4] font-mono">
                      {num(r.avg_wind_speed, 1)}
                    </td>
                    <td className="px-4 py-2.5 text-[#10b981] font-mono">
                      {num(r.avg_soil_moisture, 1)}
                    </td>
                    <td className="px-4 py-2.5 text-[#a78bfa] font-mono">
                      {num(r.avg_fuel_moisture, 1)}
                    </td>
                    <td className="px-4 py-2.5 text-[#8b9bb4] font-mono">
                      {num(r.avg_light_intensity, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: ReactNode;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
      <div className="text-sm text-[#8b9bb4] mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#8b9bb4] mt-1">{sub}</div>}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <AuthGuard>
      <ReportsPageContent />
    </AuthGuard>
  );
}
