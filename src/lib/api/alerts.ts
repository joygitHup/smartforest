// 告警中心 API — /api/alerts/alerts|actions|fire-tracing/

import { apiUrl } from '@/lib/api/config';
import { authFetch } from '@/lib/auth';
import type {
  AlertDetail,
  AlertListParams,
  AlertListResponse,
  AlertAction,
  AlertStatistics,
  FireTracing,
  FireTracingListParams,
  FireTracingListResponse,
  FireTracingStatistics,
  FireTracingReport,
  AlertRule,
  AlertReinforcement,
  AlertNavigation,
  WorkOrder,
  WorkOrderListResponse,
} from '@/types/alert';

const ALERTS_BASE = '/api/alerts/alerts';
const ACTIONS_BASE = '/api/alerts/actions';
const FIRE_TRACING_BASE = '/api/alerts/fire-tracing';
const RULES_BASE = '/api/alerts/rules';
const REINFORCEMENTS_BASE = '/api/alerts/reinforcements';
const WORK_ORDERS_BASE = '/api/alerts/work-orders';

async function parseError(response: Response, fallback: string): Promise<string> {
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.detail === 'string') return record.detail;
  if (typeof record.error === 'string') return record.error;
  if (typeof record.message === 'string') return record.message;
  return fallback;
}

/** GET /api/alerts/alerts/ */
export async function getAlerts(params?: AlertListParams): Promise<AlertListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.page_size) searchParams.set('page_size', String(params.page_size));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.alert_level) searchParams.set('alert_level', params.alert_level);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.alert_type) searchParams.set('alert_type', params.alert_type);
  if (params?.region) searchParams.set('region', params.region);
  if (params?.forest_zone) searchParams.set('forest_zone', params.forest_zone);
  if (params?.ordering) searchParams.set('ordering', params.ordering);

  const query = searchParams.toString();
  const url = apiUrl(query ? `${ALERTS_BASE}/?${query}` : `${ALERTS_BASE}/`);
  const response = await authFetch(url, { method: 'GET' });

  if (!response.ok) {
    throw new Error(await parseError(response, '获取告警列表失败'));
  }

  return response.json() as Promise<AlertListResponse>;
}

/** GET /api/alerts/alerts/:id/ */
export async function getAlert(id: number): Promise<AlertDetail> {
  const response = await authFetch(apiUrl(`${ALERTS_BASE}/${id}/`), { method: 'GET' });
  if (!response.ok) {
    throw new Error(await parseError(response, '获取告警详情失败'));
  }
  return response.json() as Promise<AlertDetail>;
}

/** GET /api/alerts/alerts/statistics/ */
export async function getAlertStatistics(hours = 24): Promise<AlertStatistics> {
  const response = await authFetch(
    apiUrl(`${ALERTS_BASE}/statistics/?hours=${hours}`),
    { method: 'GET' }
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '获取告警统计失败'));
  }
  return response.json() as Promise<AlertStatistics>;
}

/** POST /api/alerts/alerts/:id/acknowledge/ */
export async function acknowledgeAlert(id: number): Promise<{ status: string; message: string }> {
  const response = await authFetch(apiUrl(`${ALERTS_BASE}/${id}/acknowledge/`), {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '确认告警失败'));
  }
  return response.json() as Promise<{ status: string; message: string }>;
}

/** POST /api/alerts/alerts/:id/dispatch/ */
export async function dispatchAlert(
  id: number,
  options?: {
    assignedTo?: string;
    assigneeId?: number;
    note?: string;
    createWorkOrder?: boolean;
  }
): Promise<{
  status: string;
  message: string;
  assigned_to?: string;
  assignee_id?: number | null;
  work_order_id?: string;
  work_order_pk?: number;
}> {
  const body: Record<string, unknown> = {};
  if (options?.assignedTo) body.assigned_to = options.assignedTo;
  if (options?.assigneeId != null) body.assignee_id = options.assigneeId;
  if (options?.note) body.note = options.note;
  if (options?.createWorkOrder === false) body.create_work_order = false;

  const response = await authFetch(apiUrl(`${ALERTS_BASE}/${id}/dispatch/`), {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '派单失败'));
  }
  return response.json();
}

/** POST /api/alerts/alerts/:id/processing/ */
export async function startProcessingAlert(
  id: number,
  note?: string
): Promise<{ status: string; message: string }> {
  const response = await authFetch(apiUrl(`${ALERTS_BASE}/${id}/processing/`), {
    method: 'POST',
    body: JSON.stringify({ note: note || '开始处理告警' }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '开始处置失败'));
  }
  return response.json() as Promise<{ status: string; message: string }>;
}

/** POST /api/alerts/alerts/:id/resolve/ */
export async function resolveAlert(
  id: number,
  payload: { status: 'resolved' | 'false_alarm'; note?: string; photos?: string[] }
): Promise<{ status: string; message: string }> {
  const response = await authFetch(apiUrl(`${ALERTS_BASE}/${id}/resolve/`), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '处置告警失败'));
  }
  return response.json() as Promise<{ status: string; message: string }>;
}

/** POST /api/alerts/alerts/:id/escalate/ */
export async function escalateAlert(
  id: number,
  note?: string
): Promise<{ status: string; message: string }> {
  const response = await authFetch(apiUrl(`${ALERTS_BASE}/${id}/escalate/`), {
    method: 'POST',
    body: JSON.stringify({ note: note || '告警已升级' }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '升级告警失败'));
  }
  return response.json() as Promise<{ status: string; message: string }>;
}

/** POST /api/alerts/alerts/:id/fire_tracing/ */
export async function startFireTracing(
  id: number
): Promise<{ status: string; task_id?: string; message: string }> {
  const response = await authFetch(apiUrl(`${ALERTS_BASE}/${id}/fire_tracing/`), {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '启动火情溯源失败'));
  }
  return response.json() as Promise<{ status: string; task_id?: string; message: string }>;
}

/** GET /api/alerts/alerts/:id/actions/ */
export async function getAlertActions(id: number): Promise<AlertAction[]> {
  const response = await authFetch(apiUrl(`${ALERTS_BASE}/${id}/actions/`), {
    method: 'GET',
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '获取处置记录失败'));
  }
  return response.json() as Promise<AlertAction[]>;
}

/** GET /api/alerts/actions/?alert= */
export async function getActions(params?: {
  alert?: number;
  page?: number;
  page_size?: number;
  search?: string;
  action_type?: string;
  operator?: string;
}): Promise<{ count: number; results: AlertAction[] }> {
  const searchParams = new URLSearchParams();
  if (params?.alert) searchParams.set('alert', String(params.alert));
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.page_size) searchParams.set('page_size', String(params.page_size));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.action_type) searchParams.set('action_type', params.action_type);
  if (params?.operator) searchParams.set('operator', params.operator);
  const query = searchParams.toString();
  const response = await authFetch(
    apiUrl(query ? `${ACTIONS_BASE}/?${query}` : `${ACTIONS_BASE}/`),
    { method: 'GET' }
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '获取处置记录列表失败'));
  }
  return response.json() as Promise<{ count: number; results: AlertAction[] }>;
}

/** GET /api/alerts/fire-tracing/ */
export async function getFireTracings(
  params?: FireTracingListParams
): Promise<FireTracingListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.page_size) searchParams.set('page_size', String(params.page_size));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.alert) searchParams.set('alert', String(params.alert));
  if (params?.alert_level) searchParams.set('alert_level', params.alert_level);
  if (params?.alert_status) searchParams.set('alert_status', params.alert_status);
  if (params?.alert_type) searchParams.set('alert_type', params.alert_type);
  if (params?.region) searchParams.set('region', params.region);
  if (params?.forest_zone) searchParams.set('forest_zone', params.forest_zone);
  if (params?.algorithm) searchParams.set('algorithm', params.algorithm);
  if (params?.ordering) searchParams.set('ordering', params.ordering);
  const query = searchParams.toString();
  const response = await authFetch(
    apiUrl(query ? `${FIRE_TRACING_BASE}/?${query}` : `${FIRE_TRACING_BASE}/`),
    { method: 'GET' }
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '获取火情溯源列表失败'));
  }
  return response.json() as Promise<FireTracingListResponse>;
}

/** GET /api/alerts/fire-tracing/:id/ */
export async function getFireTracing(id: number): Promise<FireTracing> {
  const response = await authFetch(apiUrl(`${FIRE_TRACING_BASE}/${id}/`), {
    method: 'GET',
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '获取火情溯源详情失败'));
  }
  return response.json() as Promise<FireTracing>;
}

/** GET /api/alerts/fire-tracing/statistics/ */
export async function getFireTracingStatistics(): Promise<FireTracingStatistics> {
  const response = await authFetch(apiUrl(`${FIRE_TRACING_BASE}/statistics/`), {
    method: 'GET',
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '获取火情溯源统计失败'));
  }
  return response.json() as Promise<FireTracingStatistics>;
}

/** POST /api/alerts/fire-tracing/create_tracing/ */
export async function createFireTracing(payload: {
  alert_id: number;
  origin_longitude?: number;
  origin_latitude?: number;
}): Promise<{ status: string; task_id?: string; message: string }> {
  const response = await authFetch(apiUrl(`${FIRE_TRACING_BASE}/create_tracing/`), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '创建火情溯源失败'));
  }
  return response.json() as Promise<{ status: string; task_id?: string; message: string }>;
}

/** GET /api/alerts/fire-tracing/:id/report/ — 下载报告 JSON */
export async function downloadFireTracingReport(id: number): Promise<void> {
  const response = await authFetch(apiUrl(`${FIRE_TRACING_BASE}/${id}/report/`), {
    method: 'GET',
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '生成溯源报告失败'));
  }
  const report = (await response.json()) as FireTracingReport;
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fire_tracing_report_${id}_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * 接单处置：确认 + 派单（对接 acknowledge + dispatch）
 * 可指定处理人并生成工单。
 */
export async function acceptAndDispatchAlert(
  id: number,
  options?: {
    assignedTo?: string;
    assigneeId?: number;
    note?: string;
  }
): Promise<{
  status: string;
  message: string;
  work_order_id?: string;
}> {
  try {
    await acknowledgeAlert(id);
  } catch {
    // 已确认等状态可跳过确认，直接尝试派单
  }
  return dispatchAlert(id, options);
}

/** GET /api/alerts/work-orders/ */
export async function getWorkOrders(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  priority?: string;
  assignee?: number;
  alert?: number;
  mine?: boolean;
  is_open?: boolean;
  ordering?: string;
}): Promise<WorkOrderListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.page_size) searchParams.set('page_size', String(params.page_size));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.priority) searchParams.set('priority', params.priority);
  if (params?.assignee != null) searchParams.set('assignee', String(params.assignee));
  if (params?.alert != null) searchParams.set('alert', String(params.alert));
  if (params?.mine) searchParams.set('mine', 'true');
  if (params?.is_open != null) searchParams.set('is_open', params.is_open ? 'true' : 'false');
  if (params?.ordering) searchParams.set('ordering', params.ordering);
  const q = searchParams.toString();
  const response = await authFetch(
    apiUrl(q ? `${WORK_ORDERS_BASE}/?${q}` : `${WORK_ORDERS_BASE}/`)
  );
  if (!response.ok) throw new Error(await parseError(response, '获取工单列表失败'));
  const data: unknown = await response.json();
  if (Array.isArray(data)) {
    return { count: data.length, results: data as WorkOrder[] };
  }
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const results = Array.isArray(record.results)
      ? (record.results as WorkOrder[])
      : Array.isArray(record.data)
        ? (record.data as WorkOrder[])
        : [];
    const count =
      typeof record.count === 'number' ? record.count : results.length;
    return { count, results, next: (record.next as string | null) ?? null, previous: (record.previous as string | null) ?? null };
  }
  return { count: 0, results: [] };
}

/** GET /api/alerts/work-orders/:id/ */
export async function getWorkOrder(id: number): Promise<WorkOrder> {
  const response = await authFetch(apiUrl(`${WORK_ORDERS_BASE}/${id}/`));
  if (!response.ok) throw new Error(await parseError(response, '获取工单详情失败'));
  return response.json() as Promise<WorkOrder>;
}

export async function acceptWorkOrder(id: number): Promise<WorkOrder> {
  const response = await authFetch(apiUrl(`${WORK_ORDERS_BASE}/${id}/accept/`), {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error(await parseError(response, '接单失败'));
  return response.json() as Promise<WorkOrder>;
}

export async function startWorkOrder(id: number, note?: string): Promise<WorkOrder> {
  const response = await authFetch(apiUrl(`${WORK_ORDERS_BASE}/${id}/start/`), {
    method: 'POST',
    body: JSON.stringify({ note: note || '' }),
  });
  if (!response.ok) throw new Error(await parseError(response, '开始处理失败'));
  return response.json() as Promise<WorkOrder>;
}

export async function completeWorkOrder(
  id: number,
  options?: { note?: string; closeAlert?: boolean; alertStatus?: 'resolved' | 'false_alarm' }
): Promise<WorkOrder> {
  const response = await authFetch(apiUrl(`${WORK_ORDERS_BASE}/${id}/complete/`), {
    method: 'POST',
    body: JSON.stringify({
      note: options?.note || '',
      close_alert: options?.closeAlert !== false,
      alert_status: options?.alertStatus || 'resolved',
    }),
  });
  if (!response.ok) throw new Error(await parseError(response, '完成工单失败'));
  return response.json() as Promise<WorkOrder>;
}

export async function cancelWorkOrder(id: number, note?: string): Promise<WorkOrder> {
  const response = await authFetch(apiUrl(`${WORK_ORDERS_BASE}/${id}/cancel/`), {
    method: 'POST',
    body: JSON.stringify({ note: note || '工单已取消' }),
  });
  if (!response.ok) throw new Error(await parseError(response, '取消工单失败'));
  return response.json() as Promise<WorkOrder>;
}

/** GET /api/alerts/alerts/export/ — 下载 CSV */
export async function exportAlerts(params?: AlertListParams): Promise<void> {
  const searchParams = new URLSearchParams();
  searchParams.set('export_format', 'csv');
  if (params?.search) searchParams.set('search', params.search);
  if (params?.alert_level) searchParams.set('alert_level', params.alert_level);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.alert_type) searchParams.set('alert_type', params.alert_type);

  const response = await authFetch(
    apiUrl(`${ALERTS_BASE}/export/?${searchParams.toString()}`),
    { method: 'GET' }
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '导出告警失败'));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `alerts_export_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** POST /api/alerts/alerts/:id/reinforce/ */
export async function requestReinforcement(
  id: number,
  payload: { reason: string; contact?: string; required_people?: number }
): Promise<AlertReinforcement> {
  const response = await authFetch(apiUrl(`${ALERTS_BASE}/${id}/reinforce/`), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '请求增援失败'));
  }
  return response.json() as Promise<AlertReinforcement>;
}

/** GET /api/alerts/alerts/:id/navigation/ */
export async function getAlertNavigation(id: number): Promise<AlertNavigation> {
  const response = await authFetch(apiUrl(`${ALERTS_BASE}/${id}/navigation/`), {
    method: 'GET',
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '获取导航信息失败'));
  }
  return response.json() as Promise<AlertNavigation>;
}

/** GET /api/alerts/rules/ */
export async function getAlertRules(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  alert_level?: string;
  is_enabled?: boolean;
  /** 顶部林区筛选：林区名称 */
  forest_zone?: string;
  region?: string;
}): Promise<{ count: number; results: AlertRule[] }> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.page_size) searchParams.set('page_size', String(params.page_size));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.alert_level) searchParams.set('alert_level', params.alert_level);
  if (params?.is_enabled !== undefined) searchParams.set('is_enabled', String(params.is_enabled));
  if (params?.forest_zone) searchParams.set('forest_zone', params.forest_zone);
  if (params?.region) searchParams.set('region', params.region);
  const query = searchParams.toString();
  const response = await authFetch(
    apiUrl(query ? `${RULES_BASE}/?${query}` : `${RULES_BASE}/`),
    { method: 'GET' }
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '获取告警规则失败'));
  }
  return response.json() as Promise<{ count: number; results: AlertRule[] }>;
}

/** POST /api/alerts/rules/ */
export async function createAlertRule(
  data: Partial<AlertRule> | Record<string, unknown>
): Promise<AlertRule> {
  const response = await authFetch(apiUrl(`${RULES_BASE}/`), {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '创建告警规则失败'));
  }
  return response.json() as Promise<AlertRule>;
}

/** PATCH /api/alerts/rules/:id/ */
export async function updateAlertRule(
  id: number,
  data: Partial<AlertRule> | Record<string, unknown>
): Promise<AlertRule> {
  const response = await authFetch(apiUrl(`${RULES_BASE}/${id}/`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '更新告警规则失败'));
  }
  return response.json() as Promise<AlertRule>;
}

/** DELETE /api/alerts/rules/:id/ */
export async function deleteAlertRule(id: number): Promise<void> {
  const response = await authFetch(apiUrl(`${RULES_BASE}/${id}/`), {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '删除告警规则失败'));
  }
}

/** GET /api/alerts/reinforcements/ */
export async function getReinforcements(params?: {
  alert?: number;
  page?: number;
}): Promise<{ count: number; results: AlertReinforcement[] }> {
  const searchParams = new URLSearchParams();
  if (params?.alert) searchParams.set('alert', String(params.alert));
  if (params?.page) searchParams.set('page', String(params.page));
  const query = searchParams.toString();
  const response = await authFetch(
    apiUrl(query ? `${REINFORCEMENTS_BASE}/?${query}` : `${REINFORCEMENTS_BASE}/`),
    { method: 'GET' }
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '获取增援列表失败'));
  }
  return response.json() as Promise<{ count: number; results: AlertReinforcement[] }>;
}
