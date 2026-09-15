// 系统运维 API — /api/ops/

import { apiUrl } from '@/lib/api/config';
import { authFetch } from '@/lib/auth';

export interface OpsServiceItem {
  name: string;
  url: string;
  port_hint?: string;
  ok?: boolean | null;
  error?: string | null;
}

export interface OpsTarget {
  job?: string;
  instance?: string;
  health?: string;
  last_error?: string;
  last_scrape?: string;
  scrape_url?: string;
}

export interface OpsUpSeries {
  job?: string;
  instance?: string;
  value?: string | null;
}

export interface OpsOverview {
  prometheus: {
    url: string;
    ui: string;
    ready: boolean;
    ready_error?: string | null;
    targets_error?: string | null;
    up_query_error?: string | null;
    targets: OpsTarget[];
    up: OpsUpSeries[];
  };
  django_metrics: {
    url: string;
    ok: boolean;
    status_code?: number | null;
    error?: string | null;
    sample_count: number;
    metric_names: Array<{ name: string }>;
  };
  services: OpsServiceItem[];
}

async function parseError(response: Response, fallback: string): Promise<string> {
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.error === 'string') return record.error;
  if (typeof record.detail === 'string') return record.detail;
  return fallback;
}

/** GET /api/ops/overview/ */
export async function getOpsOverview(): Promise<OpsOverview> {
  const response = await authFetch(apiUrl('/api/ops/overview/'));
  if (!response.ok) {
    throw new Error(await parseError(response, '获取运维概览失败'));
  }
  return response.json() as Promise<OpsOverview>;
}

export interface DiagnosticsEvent {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | string;
  source: string;
  message: string;
  category?: string;
}

export interface OpsDiagnostics {
  generated_at: string;
  org_scope?: {
    unrestricted: boolean;
    organization_id?: number | null;
    organization_name?: string | null;
    organization_code?: string | null;
    scope_org_ids?: number[] | null;
    scope_label?: string;
  };
  health_score: number;
  health_label: string;
  host: {
    ok?: boolean;
    cpu_percent?: number;
    cpu_count?: number;
    memory_percent?: number;
    memory_total_gb?: number;
    memory_used_gb?: number;
    disk?: {
      total_gb?: number;
      used_gb?: number;
      free_gb?: number;
      percent?: number;
      path?: string;
      error?: string;
    };
    net?: { bytes_sent_mb?: number; bytes_recv_mb?: number };
    error?: string;
    hint?: string;
  };
  services: Array<{
    name: string;
    ok?: boolean;
    error?: string | null;
    url?: string;
    host?: string;
    topics?: string[];
  }>;
  devices: {
    total: number;
    online: number;
    offline: number;
    alarm: number;
    maintenance: number;
    low_battery: number;
  };
  commands: {
    pending: number;
    failed_24h: number;
    sent_24h: number;
  };
  alerts: {
    open: number;
    level_1_open: number;
    last_24h: number;
  };
  pipeline: {
    enabled: boolean;
    kafka_ok: boolean;
    path: string;
  };
  events: DiagnosticsEvent[];
  event_counts: {
    all: number;
    error: number;
    warn: number;
    info: number;
  };
}

/** GET /api/ops/diagnostics/ */
export async function getOpsDiagnostics(): Promise<OpsDiagnostics> {
  const response = await authFetch(apiUrl('/api/ops/diagnostics/'));
  if (!response.ok) {
    throw new Error(await parseError(response, '获取运维诊断失败'));
  }
  return response.json() as Promise<OpsDiagnostics>;
}

/** GET /api/ops/metrics/query/?query= */
export async function queryOpsMetrics(query: string): Promise<{
  ok: boolean;
  query: string;
  prometheus?: unknown;
  error?: string;
}> {
  const sp = new URLSearchParams({ query });
  const response = await authFetch(apiUrl(`/api/ops/metrics/query/?${sp.toString()}`));
  if (!response.ok) {
    throw new Error(await parseError(response, 'Prometheus 查询失败'));
  }
  return response.json();
}
