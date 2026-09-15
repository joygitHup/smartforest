// 报表中心 API — /api/reports/

import { apiUrl } from '@/lib/api/config';
import { authFetch } from '@/lib/auth';
import type {
  AlertAnalysis,
  DailyReport,
  DailyReportSummary,
  DeviceStatistic,
  DeviceStatisticsSummary,
  EnvironmentalDailySummary,
  EnvironmentalData,
  GenerateResult,
  Paginated,
} from '@/types/report';

const DAILY_BASE = '/api/reports/daily-reports';
const DEVICE_BASE = '/api/reports/device-statistics';
const ENV_BASE = '/api/reports/environmental';

async function parseError(response: Response, fallback: string): Promise<string> {
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.detail === 'string') return record.detail;
  if (typeof record.error === 'string') return record.error;
  if (typeof record.message === 'string') return record.message;
  return fallback;
}

/** GET /api/reports/daily-reports/ */
export async function getDailyReports(params?: {
  page?: number;
  page_size?: number;
  report_date?: string;
  report_date_after?: string;
  report_date_before?: string;
  ordering?: string;
}): Promise<Paginated<DailyReport>> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.page_size) sp.set('page_size', String(params.page_size));
  if (params?.report_date) sp.set('report_date', params.report_date);
  if (params?.report_date_after) sp.set('report_date_after', params.report_date_after);
  if (params?.report_date_before) sp.set('report_date_before', params.report_date_before);
  if (params?.ordering) sp.set('ordering', params.ordering);
  const q = sp.toString();
  const response = await authFetch(apiUrl(q ? `${DAILY_BASE}/?${q}` : `${DAILY_BASE}/`));
  if (!response.ok) throw new Error(await parseError(response, '获取日报列表失败'));
  return response.json() as Promise<Paginated<DailyReport>>;
}

/** GET /api/reports/daily-reports/by_date/?report_date= */
export async function getDailyReportByDate(reportDate: string): Promise<DailyReport | null> {
  const response = await authFetch(
    apiUrl(`${DAILY_BASE}/by_date/?report_date=${encodeURIComponent(reportDate)}`)
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await parseError(response, '获取日报失败'));
  return response.json() as Promise<DailyReport>;
}

/** GET /api/reports/daily-reports/:id/ */
export async function getDailyReport(id: number): Promise<DailyReport> {
  const response = await authFetch(apiUrl(`${DAILY_BASE}/${id}/`));
  if (!response.ok) throw new Error(await parseError(response, '获取日报详情失败'));
  return response.json() as Promise<DailyReport>;
}

/** POST /api/reports/daily-reports/generate/ */
export async function generateDailyReport(payload: {
  report_date?: string;
  force?: boolean;
  sync?: boolean;
  full?: boolean;
}): Promise<GenerateResult> {
  const response = await authFetch(apiUrl(`${DAILY_BASE}/generate/`), {
    method: 'POST',
    body: JSON.stringify({
      sync: true,
      full: true,
      ...payload,
    }),
  });
  if (!response.ok) throw new Error(await parseError(response, '生成日报失败'));
  return response.json() as Promise<GenerateResult>;
}

/** POST /api/reports/daily-reports/:id/regenerate/ */
export async function regenerateDailyReport(
  id: number,
  payload?: { sync?: boolean; full?: boolean }
): Promise<GenerateResult> {
  const response = await authFetch(apiUrl(`${DAILY_BASE}/${id}/regenerate/`), {
    method: 'POST',
    body: JSON.stringify({ sync: true, full: true, ...payload }),
  });
  if (!response.ok) throw new Error(await parseError(response, '重新生成日报失败'));
  return response.json() as Promise<GenerateResult>;
}

/** GET /api/reports/daily-reports/summary/ */
export async function getDailyReportSummary(days = 30): Promise<DailyReportSummary> {
  const response = await authFetch(apiUrl(`${DAILY_BASE}/summary/?days=${days}`));
  if (!response.ok) throw new Error(await parseError(response, '获取日报汇总失败'));
  return response.json() as Promise<DailyReportSummary>;
}

/** GET /api/reports/daily-reports/alert_analysis/ */
export async function getAlertAnalysis(params?: {
  report_date?: string;
  days?: number;
}): Promise<AlertAnalysis> {
  const sp = new URLSearchParams();
  if (params?.report_date) sp.set('report_date', params.report_date);
  if (params?.days) sp.set('days', String(params.days));
  const q = sp.toString();
  const response = await authFetch(
    apiUrl(q ? `${DAILY_BASE}/alert_analysis/?${q}` : `${DAILY_BASE}/alert_analysis/`)
  );
  if (!response.ok) throw new Error(await parseError(response, '获取告警分析失败'));
  return response.json() as Promise<AlertAnalysis>;
}

/** 导出日报 CSV */
export async function exportDailyReport(params: {
  id?: number;
  report_date?: string;
}): Promise<void> {
  let url: string;
  if (params.id) {
    url = apiUrl(`${DAILY_BASE}/${params.id}/export/?export_format=csv`);
  } else if (params.report_date) {
    url = apiUrl(
      `${DAILY_BASE}/export_by_date/?report_date=${encodeURIComponent(params.report_date)}`
    );
  } else {
    throw new Error('请指定日报 id 或日期');
  }
  const response = await authFetch(url);
  if (!response.ok) throw new Error(await parseError(response, '导出日报失败'));
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `daily_report_${params.report_date || params.id}_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/** GET /api/reports/device-statistics/ */
export async function getDeviceStatistics(params?: {
  page?: number;
  page_size?: number;
  stat_date?: string;
  ordering?: string;
}): Promise<Paginated<DeviceStatistic>> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.page_size) sp.set('page_size', String(params.page_size));
  if (params?.stat_date) sp.set('stat_date', params.stat_date);
  if (params?.ordering) sp.set('ordering', params.ordering);
  const q = sp.toString();
  const response = await authFetch(apiUrl(q ? `${DEVICE_BASE}/?${q}` : `${DEVICE_BASE}/`));
  if (!response.ok) throw new Error(await parseError(response, '获取设备统计失败'));
  return response.json() as Promise<Paginated<DeviceStatistic>>;
}

/** GET /api/reports/device-statistics/summary/ */
export async function getDeviceStatisticsSummary(params?: {
  days?: number;
  stat_date?: string;
  device_id?: string;
}): Promise<DeviceStatisticsSummary> {
  const sp = new URLSearchParams();
  if (params?.days) sp.set('days', String(params.days));
  if (params?.stat_date) sp.set('stat_date', params.stat_date);
  if (params?.device_id) sp.set('device_id', params.device_id);
  const q = sp.toString();
  const response = await authFetch(
    apiUrl(q ? `${DEVICE_BASE}/summary/?${q}` : `${DEVICE_BASE}/summary/`)
  );
  if (!response.ok) throw new Error(await parseError(response, '获取设备统计汇总失败'));
  return response.json() as Promise<DeviceStatisticsSummary>;
}

/** POST /api/reports/device-statistics/generate/ */
export async function generateDeviceStatistics(payload: {
  stat_date?: string;
  sync?: boolean;
}): Promise<GenerateResult> {
  const response = await authFetch(apiUrl(`${DEVICE_BASE}/generate/`), {
    method: 'POST',
    body: JSON.stringify({ sync: true, ...payload }),
  });
  if (!response.ok) throw new Error(await parseError(response, '生成设备统计失败'));
  return response.json() as Promise<GenerateResult>;
}

/** GET /api/reports/environmental/ */
export async function getEnvironmentalData(params?: {
  page?: number;
  page_size?: number;
  region?: string;
  stat_date?: string;
}): Promise<Paginated<EnvironmentalData>> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.page_size) sp.set('page_size', String(params.page_size));
  if (params?.region) sp.set('region', params.region);
  if (params?.stat_date) sp.set('stat_date', params.stat_date);
  const q = sp.toString();
  const response = await authFetch(apiUrl(q ? `${ENV_BASE}/?${q}` : `${ENV_BASE}/`));
  if (!response.ok) throw new Error(await parseError(response, '获取环境数据失败'));
  return response.json() as Promise<Paginated<EnvironmentalData>>;
}

/** GET /api/reports/environmental/daily_summary/ */
export async function getEnvironmentalDailySummary(params?: {
  stat_date?: string;
  region?: string;
}): Promise<EnvironmentalDailySummary> {
  const sp = new URLSearchParams();
  if (params?.stat_date) sp.set('stat_date', params.stat_date);
  if (params?.region) sp.set('region', params.region);
  const q = sp.toString();
  const response = await authFetch(
    apiUrl(q ? `${ENV_BASE}/daily_summary/?${q}` : `${ENV_BASE}/daily_summary/`)
  );
  if (!response.ok) throw new Error(await parseError(response, '获取环境日汇总失败'));
  return response.json() as Promise<EnvironmentalDailySummary>;
}

/** POST /api/reports/environmental/generate/ */
export async function generateEnvironmentalData(payload: {
  stat_date?: string;
  sync?: boolean;
}): Promise<GenerateResult> {
  const response = await authFetch(apiUrl(`${ENV_BASE}/generate/`), {
    method: 'POST',
    body: JSON.stringify({ sync: true, ...payload }),
  });
  if (!response.ok) throw new Error(await parseError(response, '生成环境数据失败'));
  return response.json() as Promise<GenerateResult>;
}
