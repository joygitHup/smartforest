'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCommandAudit, type CommandAuditReport } from '@/lib/api/devices';

/** 设备指令操作审计（近 N 小时） */
export default function CommandAuditPanel() {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<CommandAuditReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getCommandAudit({ hours, limit: 30 });
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载审计失败');
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#8b9bb4] hover:text-[#e8f1ff]"
      >
        <span>操作审计（指令下发记录）</span>
        <span>{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-[#1e3a5f]">
          <div className="flex items-center gap-2 pt-2">
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1 text-[11px] text-[#e8f1ff]"
            >
              <option value={6}>近 6 小时</option>
              <option value={24}>近 24 小时</option>
              <option value={72}>近 3 天</option>
              <option value={168}>近 7 天</option>
            </select>
            <button
              type="button"
              onClick={() => void load()}
              className="px-2 py-1 text-[11px] border border-[#1e3a5f] rounded text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6]"
            >
              刷新
            </button>
            {report && (
              <span className="text-[11px] text-[#e8f1ff] font-mono">合计 {report.total}</span>
            )}
          </div>
          {loading && <div className="text-[11px] text-[#8b9bb4]">加载中…</div>}
          {error && <div className="text-[11px] text-[#ef4444]">{error}</div>}
          {report && !loading && (
            <>
              <div className="flex flex-wrap gap-3 text-[10px] text-[#8b9bb4]">
                {Object.entries(report.by_type).map(([k, v]) => (
                  <span key={k}>
                    {k}: <span className="text-[#e8f1ff] font-mono">{v}</span>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 text-[10px] text-[#8b9bb4]">
                {Object.entries(report.by_status).map(([k, v]) => (
                  <span key={k}>
                    {k}: <span className="text-[#e8f1ff] font-mono">{v}</span>
                  </span>
                ))}
              </div>
              <div className="max-h-36 overflow-auto space-y-1">
                {report.recent.map((c) => (
                  <div
                    key={c.id}
                    className="flex justify-between gap-2 text-[11px] border-b border-[#1e3a5f]/40 py-1"
                  >
                    <span className="text-[#e8f1ff] truncate">
                      {c.device_id} · {c.command_type} · {c.operator_name || '-'}
                    </span>
                    <span className="text-[#8b9bb4] shrink-0">{c.status_display || c.status}</span>
                  </div>
                ))}
                {report.recent.length === 0 && (
                  <div className="text-[11px] text-[#8b9bb4]">暂无记录</div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
