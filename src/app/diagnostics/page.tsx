'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminGuard } from '@/components/admin-guard';
import { getOpsDiagnostics, type OpsDiagnostics } from '@/lib/api/ops';

type LevelFilter = 'all' | 'error' | 'warn' | 'info';

function formatTime(iso?: string): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-[#10b981]';
  if (score >= 60) return 'text-[#f59e0b]';
  return 'text-[#ef4444]';
}

function DiagnosticsPageContent() {
  const [data, setData] = useState<OpsDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<LevelFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getOpsDiagnostics());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [load]);

  const events = useMemo(() => {
    const list = data?.events || [];
    if (filter === 'all') return list;
    return list.filter((e) => e.level === filter);
  }, [data, filter]);

  const exportEvents = () => {
    if (!data) return;
    const rows = [
      ['timestamp', 'level', 'source', 'category', 'message'],
      ...events.map((e) => [
        e.timestamp,
        e.level,
        e.source,
        e.category || '',
        e.message.replace(/\r?\n/g, ' '),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const host = data?.host;
  const disk = host?.disk;

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-[#e8f1ff]">运维诊断</h1>
          {data?.generated_at && (
            <p className="text-[10px] text-[#8b9bb4] mt-0.5 font-mono">
              更新于 {formatTime(data.generated_at)} · 每 30s 自动刷新
              {data.org_scope?.scope_label
                ? ` · 数据范围：${data.org_scope.scope_label}`
                : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/ops/metrics"
            className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors"
          >
            Metrics 监控 →
          </Link>
          <button
            type="button"
            disabled={!data || events.length === 0}
            onClick={exportEvents}
            className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors disabled:opacity-40"
          >
            导出事件
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors"
          >
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="text-xs text-[#8b9bb4] py-10 text-center">加载诊断数据…</div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
              <div className="text-xs text-[#8b9bb4] mb-1">系统健康度</div>
              <div className={`text-2xl font-bold font-mono ${scoreColor(data.health_score)}`}>
                {data.health_score}
                <span className="text-sm">%</span>
              </div>
              <div className="text-[10px] text-[#8b9bb4] mt-1">{data.health_label}</div>
            </div>
            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
              <div className="text-xs text-[#8b9bb4] mb-1">CPU 使用率</div>
              <div className="text-2xl font-bold font-mono text-[#3b82f6]">
                {host?.cpu_percent != null ? `${host.cpu_percent}%` : '-'}
              </div>
              <div className="text-[10px] text-[#8b9bb4] mt-1">
                {host?.cpu_count ? `${host.cpu_count} 核` : host?.hint || '本机采样'}
              </div>
            </div>
            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
              <div className="text-xs text-[#8b9bb4] mb-1">内存使用</div>
              <div className="text-2xl font-bold font-mono text-[#06b6d4]">
                {host?.memory_percent != null ? `${host.memory_percent}%` : '-'}
              </div>
              <div className="text-[10px] text-[#8b9bb4] mt-1">
                {host?.memory_used_gb != null && host?.memory_total_gb != null
                  ? `${host.memory_used_gb} / ${host.memory_total_gb} GB`
                  : '-'}
              </div>
            </div>
            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4">
              <div className="text-xs text-[#8b9bb4] mb-1">磁盘使用</div>
              <div className="text-2xl font-bold font-mono text-[#f59e0b]">
                {disk?.percent != null ? `${disk.percent}%` : '-'}
              </div>
              <div className="text-[10px] text-[#8b9bb4] mt-1">
                {disk?.used_gb != null && disk?.total_gb != null
                  ? `${disk.used_gb} / ${disk.total_gb} GB`
                  : disk?.error || '-'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4 space-y-2">
              <div className="text-sm text-[#e8f1ff]">依赖服务</div>
              <div className="space-y-1.5 max-h-44 overflow-auto">
                {data.services.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center justify-between gap-2 text-[11px] border-b border-[#1e3a5f]/40 py-1"
                  >
                    <span className="text-[#e8f1ff]">{s.name}</span>
                    <span className={s.ok ? 'text-[#10b981]' : 'text-[#ef4444]'}>
                      {s.ok ? '正常' : '异常'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-[#8b9bb4]">
                管线: {data.pipeline.path} · Kafka{' '}
                {data.pipeline.kafka_ok ? '可用' : '不可用'}
              </div>
            </div>

            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4 space-y-2">
              <div className="text-sm text-[#e8f1ff]">设备概况</div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="text-[#8b9bb4]">
                  总数 <span className="text-[#e8f1ff] font-mono">{data.devices.total}</span>
                </div>
                <div className="text-[#8b9bb4]">
                  在线 <span className="text-[#10b981] font-mono">{data.devices.online}</span>
                </div>
                <div className="text-[#8b9bb4]">
                  离线 <span className="text-[#ef4444] font-mono">{data.devices.offline}</span>
                </div>
                <div className="text-[#8b9bb4]">
                  告警 <span className="text-[#f59e0b] font-mono">{data.devices.alarm}</span>
                </div>
                <div className="text-[#8b9bb4]">
                  低电量 <span className="text-[#f59e0b] font-mono">{data.devices.low_battery}</span>
                </div>
                <div className="text-[#8b9bb4]">
                  维护 <span className="text-[#8b9bb4] font-mono">{data.devices.maintenance}</span>
                </div>
              </div>
            </div>

            <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4 space-y-2">
              <div className="text-sm text-[#e8f1ff]">指令 / 告警</div>
              <div className="grid grid-cols-1 gap-1.5 text-[11px]">
                <div className="text-[#8b9bb4]">
                  24h 指令{' '}
                  <span className="text-[#e8f1ff] font-mono">{data.commands.sent_24h}</span>
                  ，失败{' '}
                  <span className="text-[#ef4444] font-mono">{data.commands.failed_24h}</span>
                  ，待发送{' '}
                  <span className="text-[#f59e0b] font-mono">{data.commands.pending}</span>
                </div>
                <div className="text-[#8b9bb4]">
                  未关闭告警{' '}
                  <span className="text-[#e8f1ff] font-mono">{data.alerts.open}</span>
                  ，一级{' '}
                  <span className="text-[#ef4444] font-mono">{data.alerts.level_1_open}</span>
                </div>
                <div className="text-[#8b9bb4]">
                  24h 新增告警{' '}
                  <span className="text-[#e8f1ff] font-mono">{data.alerts.last_24h}</span>
                </div>
                {host?.net && (
                  <div className="text-[#8b9bb4]">
                    网卡累计 ↑{host.net.bytes_sent_mb}MB ↓{host.net.bytes_recv_mb}MB
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#8b9bb4]">事件级别:</span>
            {(['all', 'error', 'warn', 'info'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setFilter(level)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  filter === level
                    ? level === 'error'
                      ? 'bg-[#ef4444]/20 text-[#ef4444]'
                      : level === 'warn'
                        ? 'bg-[#f59e0b]/20 text-[#f59e0b]'
                        : level === 'info'
                          ? 'bg-[#3b82f6]/20 text-[#3b82f6]'
                          : 'bg-[#3b82f6]/20 text-[#3b82f6]'
                    : 'text-[#8b9bb4] hover:text-[#e8f1ff]'
                }`}
              >
                {level === 'all'
                  ? `全部(${data.event_counts.all})`
                  : level === 'error'
                    ? `错误(${data.event_counts.error})`
                    : level === 'warn'
                      ? `警告(${data.event_counts.warn})`
                      : `信息(${data.event_counts.info})`}
              </button>
            ))}
            <span className="text-[10px] text-[#8b9bb4] ml-auto">当前 {events.length} 条</span>
          </div>

          <div className="flex-1 bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden flex flex-col min-h-0">
            <div className="overflow-auto flex-1">
              <table className="w-full">
                <thead className="bg-[#0f1e35] sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4] w-44">
                      时间
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4] w-20">
                      级别
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4] w-28">
                      来源
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[#8b9bb4]">消息</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-xs text-[#8b9bb4]">
                        暂无诊断事件
                      </td>
                    </tr>
                  ) : (
                    events.map((log) => (
                      <tr
                        key={log.id}
                        className="border-t border-[#1e3a5f]/50 hover:bg-[#1a2d4a] transition-colors"
                      >
                        <td className="px-4 py-2 text-xs text-[#8b9bb4] font-mono whitespace-nowrap">
                          {formatTime(log.timestamp)}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              log.level === 'error'
                                ? 'bg-[#ef4444]/10 text-[#ef4444]'
                                : log.level === 'warn'
                                  ? 'bg-[#f59e0b]/10 text-[#f59e0b]'
                                  : 'bg-[#3b82f6]/10 text-[#3b82f6]'
                            }`}
                          >
                            {log.level === 'error'
                              ? 'ERROR'
                              : log.level === 'warn'
                                ? 'WARN'
                                : 'INFO'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-[#e8f1ff] font-mono">{log.source}</td>
                        <td className="px-4 py-2 text-xs text-[#8b9bb4]">{log.message}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function DiagnosticsPage() {
  return (
    <AdminGuard>
      <DiagnosticsPageContent />
    </AdminGuard>
  );
}
