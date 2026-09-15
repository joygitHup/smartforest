'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminGuard } from '@/components/admin-guard';
import {
  getOpsOverview,
  queryOpsMetrics,
  type OpsOverview,
} from '@/lib/api/ops';

function StatusDot({ ok }: { ok?: boolean | null }) {
  if (ok === true) return <span className="inline-block w-2 h-2 rounded-full bg-[#10b981]" />;
  if (ok === false) return <span className="inline-block w-2 h-2 rounded-full bg-[#ef4444]" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-[#8b9bb4]" />;
}

function MetricsPageContent() {
  const [data, setData] = useState<OpsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('up');
  const [queryResult, setQueryResult] = useState('');
  const [queryBusy, setQueryBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getOpsOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runQuery = async () => {
    setQueryBusy(true);
    setQueryResult('');
    try {
      const res = await queryOpsMetrics(query.trim() || 'up');
      setQueryResult(JSON.stringify(res.prometheus ?? res, null, 2));
    } catch (err) {
      setQueryResult(err instanceof Error ? err.message : '查询失败');
    } finally {
      setQueryBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-[#e8f1ff]">Metrics 监控</h1>
          <p className="text-[11px] text-[#8b9bb4] mt-0.5">
            Django <span className="font-mono text-[#93c5fd]">/metrics/</span> + Prometheus 抓取与查询
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb]"
        >
          刷新
        </button>
      </div>

      {loading && (
        <div className="text-xs text-[#8b9bb4] py-8 text-center">加载中…</div>
      )}
      {error && (
        <div className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.services.map((svc) => (
              <div
                key={svc.name}
                className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-3 space-y-1"
              >
                <div className="flex items-center gap-2 text-xs text-[#e8f1ff]">
                  <StatusDot ok={svc.ok} />
                  {svc.name}
                </div>
                <div className="text-[10px] text-[#8b9bb4] font-mono truncate" title={svc.url}>
                  {svc.url}
                </div>
                <div className="text-[10px] text-[#8b9bb4]">端口提示: {svc.port_hint || '-'}</div>
                {svc.error && (
                  <div className="text-[10px] text-[#f59e0b] truncate" title={svc.error}>
                    {svc.error}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 flex-1">
            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-[#e8f1ff]">Prometheus Targets</div>
                <a
                  href={data.prometheus.ui}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-[#3b82f6] hover:underline"
                >
                  打开 Prometheus UI →
                </a>
              </div>
              <div className="text-[11px] text-[#8b9bb4]">
                状态:{' '}
                <span className={data.prometheus.ready ? 'text-[#10b981]' : 'text-[#ef4444]'}>
                  {data.prometheus.ready ? 'Ready' : 'Down'}
                </span>
                {data.prometheus.ready_error ? ` · ${data.prometheus.ready_error}` : ''}
              </div>
              {data.prometheus.targets.length === 0 ? (
                <div className="text-xs text-[#8b9bb4]">
                  暂无 target（检查 prometheus.yml 与 scrape 配置）
                  {data.prometheus.targets_error ? ` · ${data.prometheus.targets_error}` : ''}
                </div>
              ) : (
                <div className="max-h-56 overflow-auto space-y-1">
                  {data.prometheus.targets.map((t, idx) => (
                    <div
                      key={`${t.job}-${t.instance}-${idx}`}
                      className="flex items-center justify-between gap-2 text-[11px] border-b border-[#1e3a5f]/50 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="text-[#e8f1ff] truncate">
                          {t.job} · {t.instance}
                        </div>
                        {t.last_error ? (
                          <div className="text-[#f59e0b] truncate">{t.last_error}</div>
                        ) : null}
                      </div>
                      <span
                        className={
                          t.health === 'up' ? 'text-[#10b981] shrink-0' : 'text-[#ef4444] shrink-0'
                        }
                      >
                        {t.health || '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {data.prometheus.up.length > 0 && (
                <div className="text-[10px] text-[#8b9bb4]">
                  up 序列: {data.prometheus.up.map((u) => `${u.job}=${u.value}`).join(' · ')}
                </div>
              )}
            </div>

            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4 space-y-3">
              <div className="text-sm text-[#e8f1ff]">Django /metrics/</div>
              <div className="text-[11px] text-[#8b9bb4]">
                <span className={data.django_metrics.ok ? 'text-[#10b981]' : 'text-[#ef4444]'}>
                  {data.django_metrics.ok ? '可访问' : '不可用'}
                </span>
                {' · '}
                <span className="font-mono">{data.django_metrics.url}</span>
                {' · '}
                {data.django_metrics.sample_count} 行
              </div>
              {data.django_metrics.error && (
                <div className="text-[11px] text-[#f59e0b]">{data.django_metrics.error}</div>
              )}
              <div className="text-[10px] text-[#8b9bb4] mb-1">指标名抽样</div>
              <div className="max-h-48 overflow-auto flex flex-wrap gap-1.5 content-start">
                {data.django_metrics.metric_names.map((m) => (
                  <span
                    key={m.name}
                    className="px-1.5 py-0.5 text-[10px] font-mono bg-[#0f1e35] border border-[#1e3a5f] rounded text-[#93c5fd]"
                  >
                    {m.name}
                  </span>
                ))}
                {data.django_metrics.metric_names.length === 0 && (
                  <span className="text-xs text-[#8b9bb4]">无样本（确认 django_prometheus 中间件与 runserver）</span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4 space-y-3">
            <div className="text-sm text-[#e8f1ff]">PromQL 查询（代理）</div>
            <div className="flex flex-wrap gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-[#0f1e35] border border-[#1e3a5f] rounded text-[#e8f1ff] font-mono"
                placeholder="例如: up / django_http_requests_total_by_method_total"
              />
              <button
                type="button"
                disabled={queryBusy}
                onClick={() => void runQuery()}
                className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded disabled:opacity-50"
              >
                {queryBusy ? '查询中…' : '执行'}
              </button>
            </div>
            {queryResult && (
              <pre className="max-h-48 overflow-auto text-[10px] font-mono text-[#8b9bb4] bg-[#0a1628] border border-[#1e3a5f] rounded p-3 whitespace-pre-wrap">
                {queryResult}
              </pre>
            )}
          </div>

          <div className="text-[10px] text-[#8b9bb4] leading-relaxed">
            说明：当前环境 Prometheus 映射为 <span className="font-mono">9090</span>；
            <span className="font-mono">9000/9001</span> 为 MinIO API / Console。可通过环境变量{' '}
            <span className="font-mono">PROMETHEUS_URL</span> 覆盖。
          </div>
        </>
      )}
    </div>
  );
}

export default function OpsMetricsPage() {
  return (
    <AdminGuard>
      <MetricsPageContent />
    </AdminGuard>
  );
}
