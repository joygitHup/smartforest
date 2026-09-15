'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth-guard';
import Pagination, { usePagination } from '@/components/ui/pagination';
import { useAuth } from '@/contexts/AuthContext';
import { getActions } from '@/lib/api/alerts';
import type { AlertAction } from '@/types/alert';

const actionTypeOptions = [
  { value: '', label: '全部类型' },
  { value: 'acknowledge', label: '确认告警' },
  { value: 'dispatch', label: '派单' },
  { value: 'processing', label: '开始处理' },
  { value: 'resolve', label: '处置完成' },
  { value: 'false_alarm', label: '误报标记' },
  { value: 'escalate', label: '升级告警' },
  { value: 'reinforce', label: '申请增援' },
  { value: 'reinforce_update', label: '增援状态更新' },
  { value: 'manual', label: '人工备注' },
];

const levelColors: Record<string, string> = {
  level_1: 'text-[#ef4444]',
  level_2: 'text-[#f59e0b]',
  level_3: 'text-[#3b82f6]',
};

const statusColors: Record<string, string> = {
  new: 'text-[#f59e0b]',
  acknowledged: 'text-[#a78bfa]',
  dispatched: 'text-[#3b82f6]',
  processing: 'text-[#06b6d4]',
  resolved: 'text-[#10b981]',
  false_alarm: 'text-[#8b9bb4]',
  escalated: 'text-[#ef4444]',
};

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
    second: '2-digit',
  });
}

function HandlingRecordsContent() {
  const { user } = useAuth();
  const isAdmin =
    !!user &&
    (user.is_superuser === true ||
      user.is_staff === true ||
      user.role === 'admin');
  const [items, setItems] = useState<AlertAction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [actionType, setActionType] = useState('');
  const [selected, setSelected] = useState<AlertAction | null>(null);
  const { current, pageSize, onPageChange, onPageSizeChange } = usePagination(15);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getActions({
        page: current,
        page_size: pageSize,
        search: search || undefined,
        action_type: actionType || undefined,
      });
      setItems(res.results);
      setTotalCount(res.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取处理记录失败');
      setItems([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [current, pageSize, search, actionType]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      if (current !== 1) onPageChange(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (current !== 1) onPageChange(1);
  }, [actionType]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-[#e8f1ff]">处理记录</h1>
          <p className="text-[10px] text-[#8b9bb4] mt-0.5">
            {isAdmin
              ? '系统管理员视角：可查看全部处置流水'
              : '仅显示您操作的记录，或指派给您的告警相关流水'}
          </p>
        </div>
        <Link
          href="/alerts/records"
          className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors"
        >
          查看告警记录
        </Link>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="搜索告警编号 / 标题 / 操作人 / 内容"
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] w-72"
        />
        <select
          value={actionType}
          onChange={(e) => setActionType(e.target.value)}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
        >
          {actionTypeOptions.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-[#8b9bb4]">共 {totalCount} 条</span>
      </div>

      {error ? (
        <div className="p-2 bg-red-500/10 border border-red-500/40 rounded text-xs text-red-400">
          {error}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-xs text-[#8b9bb4]">
            {isAdmin ? '暂无处理记录' : '暂无与您相关的处理记录'}
          </div>
        ) : (
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-[#0c1a2e] text-[#8b9bb4] sticky top-0">
              <tr>
                <th className="text-left font-medium px-3 py-2.5">处理时间</th>
                <th className="text-left font-medium px-3 py-2.5">操作类型</th>
                <th className="text-left font-medium px-3 py-2.5">告警</th>
                <th className="text-left font-medium px-3 py-2.5">级别</th>
                <th className="text-left font-medium px-3 py-2.5">当前状态</th>
                <th className="text-left font-medium px-3 py-2.5">操作人</th>
                <th className="text-left font-medium px-3 py-2.5">处理内容</th>
                <th className="text-right font-medium px-3 py-2.5">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-[#1e3a5f]/60 hover:bg-[#0f1e35]/50"
                >
                  <td className="px-3 py-2.5 text-[#8b9bb4] font-mono whitespace-nowrap">
                    {formatTime(item.created_at)}
                  </td>
                  <td className="px-3 py-2.5 text-[#e8f1ff] whitespace-nowrap">
                    {item.action_type_display || item.action_type}
                  </td>
                  <td className="px-3 py-2.5 max-w-[220px]">
                    <div className="text-[#e8f1ff] font-mono truncate" title={item.alert_id}>
                      {item.alert_id || `#${item.alert}`}
                    </div>
                    <div className="text-[10px] text-[#8b9bb4] truncate" title={item.alert_title}>
                      {item.alert_title || '-'}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={levelColors[item.alert_level || ''] || 'text-[#8b9bb4]'}>
                      {item.alert_level_display || item.alert_level || '-'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={statusColors[item.alert_status || ''] || 'text-[#8b9bb4]'}>
                      {item.alert_status_display || item.alert_status || '-'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#e8f1ff] whitespace-nowrap">
                    {item.operator || '-'}
                  </td>
                  <td className="px-3 py-2.5 text-[#8b9bb4] max-w-[240px]">
                    <span className="truncate block" title={item.content}>
                      {item.content || '-'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setSelected(item)}
                      className="text-[10px] text-[#3b82f6] hover:text-[#60a5fa] mr-3"
                    >
                      详情
                    </button>
                    <Link
                      href={`/alerts/records`}
                      className="text-[10px] text-[#8b9bb4] hover:text-[#3b82f6]"
                      title="前往告警记录"
                    >
                      告警
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalCount > 0 ? (
        <Pagination
          current={current}
          total={totalCount}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      ) : null}

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-[#152238] border border-[#1e3a5f] rounded-lg w-[520px] max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e3a5f]">
              <div>
                <div className="text-sm text-[#e8f1ff] font-medium">处理详情</div>
                <div className="text-[10px] text-[#8b9bb4] font-mono mt-0.5">
                  {selected.alert_id || `告警 #${selected.alert}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-[#8b9bb4] hover:text-[#e8f1ff]"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <DetailRow label="操作类型">
                {selected.action_type_display || selected.action_type}
              </DetailRow>
              <DetailRow label="处理时间">{formatTime(selected.created_at)}</DetailRow>
              <DetailRow label="操作人">{selected.operator || '-'}</DetailRow>
              <DetailRow label="告警标题">{selected.alert_title || '-'}</DetailRow>
              <DetailRow label="告警类型">
                {selected.alert_type_display || selected.alert_type || '-'}
              </DetailRow>
              <DetailRow label="告警级别">
                <span className={levelColors[selected.alert_level || ''] || 'text-[#e8f1ff]'}>
                  {selected.alert_level_display || selected.alert_level || '-'}
                </span>
              </DetailRow>
              <DetailRow label="告警当前状态">
                <span className={statusColors[selected.alert_status || ''] || 'text-[#e8f1ff]'}>
                  {selected.alert_status_display || selected.alert_status || '-'}
                </span>
              </DetailRow>
              <DetailRow label="设备">
                {selected.device_name
                  ? `${selected.device_name}${selected.device_id ? ` (${selected.device_id})` : ''}`
                  : selected.device_id || '-'}
              </DetailRow>
              <DetailRow label="林区">{selected.region || '-'}</DetailRow>
              <DetailRow label="现场位置">{selected.location || '-'}</DetailRow>
              <div>
                <div className="text-[10px] text-[#8b9bb4] mb-1">处理内容</div>
                <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3 text-[#e8f1ff] whitespace-pre-wrap">
                  {selected.content || '-'}
                </div>
              </div>
              {selected.photo_urls && selected.photo_urls.length > 0 ? (
                <div>
                  <div className="text-[10px] text-[#8b9bb4] mb-1">现场照片</div>
                  <div className="space-y-1">
                    {selected.photo_urls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-[#3b82f6] hover:underline break-all"
                      >
                        {url}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              {selected.video_url ? (
                <DetailRow label="现场视频">
                  <a
                    href={selected.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#3b82f6] hover:underline break-all"
                  >
                    {selected.video_url}
                  </a>
                </DetailRow>
              ) : null}
              <div className="pt-2">
                <Link
                  href="/alerts/records"
                  className="inline-flex px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb]"
                >
                  前往告警记录
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[10px] text-[#8b9bb4] shrink-0">{label}</span>
      <span className="text-[#e8f1ff] text-right">{children}</span>
    </div>
  );
}

export default function HandlingRecordsPage() {
  return (
    <AuthGuard>
      <HandlingRecordsContent />
    </AuthGuard>
  );
}
