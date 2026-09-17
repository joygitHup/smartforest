'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth-guard';
import Pagination, { usePagination } from '@/components/ui/pagination';
import { useAuth } from '@/contexts/AuthContext';
import {
  acceptWorkOrder,
  cancelWorkOrder,
  completeWorkOrder,
  getWorkOrder,
  getWorkOrders,
  startWorkOrder,
} from '@/lib/api/alerts';
import type { WorkOrder } from '@/types/alert';

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待接单' },
  { value: 'accepted', label: '已接单' },
  { value: 'in_progress', label: '处理中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

const statusColors: Record<string, string> = {
  pending: 'text-[#f59e0b]',
  accepted: 'text-[#a78bfa]',
  in_progress: 'text-[#06b6d4]',
  completed: 'text-[#10b981]',
  cancelled: 'text-[#8b9bb4]',
  rejected: 'text-[#ef4444]',
};

const priorityColors: Record<string, string> = {
  urgent: 'text-[#ef4444]',
  high: 'text-[#f59e0b]',
  normal: 'text-[#3b82f6]',
  low: 'text-[#8b9bb4]',
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
  });
}

function WorkOrdersContent() {
  const { user } = useAuth();
  const isAdmin =
    !!user &&
    (user.is_superuser === true ||
      user.is_staff === true ||
      user.role === 'admin');
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [selected, setSelected] = useState<WorkOrder | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [completeNote, setCompleteNote] = useState('');
  const { current, pageSize, onPageChange, onPageSizeChange } = usePagination(15);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getWorkOrders({
        page: current,
        page_size: pageSize,
        search: search || undefined,
        status: status || undefined,
        is_open: openOnly || undefined,
        ordering: '-created_at',
      });
      const rows = Array.isArray(res.results) ? res.results : [];
      setItems(rows);
      setTotalCount(typeof res.count === 'number' ? res.count : rows.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取工单失败');
      setItems([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [current, pageSize, search, status, openOnly]);

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
  }, [status, openOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetail = async (row: WorkOrder) => {
    setMessage('');
    setCompleteNote('');
    setSelected(row);
    try {
      const detail = await getWorkOrder(row.id);
      setSelected(detail);
    } catch {
      // 保留列表行数据
    }
  };

  const runAction = async (fn: () => Promise<WorkOrder>, okMsg: string) => {
    if (!selected) return;
    setActionLoading(true);
    setMessage('');
    try {
      const updated = await fn();
      setSelected(updated);
      setMessage(okMsg);
      await fetchList();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-[#e8f1ff]">工单管理</h1>
          <p className="text-[11px] text-[#8b9bb4] mt-0.5">
            {isAdmin
              ? '系统管理员视角：可查看全部工单'
              : '仅显示指派给您或由您领取的工单'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchList()}
            className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6]"
          >
            刷新
          </button>
          <Link
            href="/alerts/records"
            className="text-xs text-[#3b82f6] hover:underline"
          >
            去告警记录派单 →
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="搜索工单号/标题/处理人/告警ID"
          className="h-8 px-3 text-xs bg-[#0f1e35] border border-[#1e3a5f] rounded text-[#e8f1ff] placeholder:text-[#8b9bb4] w-56"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 px-2 text-xs bg-[#0f1e35] border border-[#1e3a5f] rounded text-[#e8f1ff]"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs text-[#8b9bb4]">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
            className="rounded border-[#1e3a5f]"
          />
          仅未闭环
        </label>
        <span className="text-[10px] text-[#8b9bb4]">共 {totalCount} 条</span>
      </div>

      {error && (
        <div className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden flex flex-col min-h-[360px]">
          <div className="overflow-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-10 h-10 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-[#0f1e35] text-[#8b9bb4] sticky top-0">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">工单号</th>
                    <th className="text-left font-medium px-4 py-3">标题</th>
                    <th className="text-left font-medium px-4 py-3">优先级</th>
                    <th className="text-left font-medium px-4 py-3">状态</th>
                    <th className="text-left font-medium px-4 py-3">处理人</th>
                    <th className="text-left font-medium px-4 py-3">关联告警</th>
                    <th className="text-left font-medium px-4 py-3">创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-[#8b9bb4]">
                        {isAdmin
                          ? '暂无工单。可在告警记录中派单生成'
                          : '暂无指派给您的工单。请等待他人派单，或在告警记录中选择「自己接单」'}
                      </td>
                    </tr>
                  )}
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => void openDetail(row)}
                      className={`border-t border-[#1e3a5f]/50 cursor-pointer hover:bg-[#0f1e35]/60 ${
                        selected?.id === row.id ? 'bg-[#0f1e35]' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-[#e8f1ff]">{row.work_order_id}</td>
                      <td className="px-4 py-3 text-[#e8f1ff] max-w-[180px] truncate">{row.title}</td>
                      <td className={`px-4 py-3 ${priorityColors[row.priority] || 'text-[#8b9bb4]'}`}>
                        {row.priority_display || row.priority}
                      </td>
                      <td className={`px-4 py-3 ${statusColors[row.status] || 'text-[#8b9bb4]'}`}>
                        {row.status_display || row.status}
                      </td>
                      <td className="px-4 py-3 text-[#e8f1ff]">{row.assignee_name || '-'}</td>
                      <td className="px-4 py-3 font-mono text-[#8b9bb4]">{row.alert_id || '-'}</td>
                      <td className="px-4 py-3 text-[#8b9bb4]">{formatTime(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="border-t border-[#1e3a5f] px-3 py-2">
            <Pagination
              current={current}
              pageSize={pageSize}
              total={totalCount}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </div>
        </div>

        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4 min-h-[320px]">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-xs text-[#8b9bb4]">
              选择一条工单查看详情
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div>
                <div className="text-[10px] text-[#8b9bb4]">工单号</div>
                <div className="text-[#e8f1ff] font-mono">{selected.work_order_id}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#8b9bb4]">标题</div>
                <div className="text-[#e8f1ff]">{selected.title}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-[#8b9bb4]">状态</div>
                  <div className={statusColors[selected.status] || 'text-[#e8f1ff]'}>
                    {selected.status_display || selected.status}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8b9bb4]">优先级</div>
                  <div className={priorityColors[selected.priority] || 'text-[#e8f1ff]'}>
                    {selected.priority_display || selected.priority}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8b9bb4]">处理人</div>
                  <div className="text-[#e8f1ff]">{selected.assignee_name || '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8b9bb4]">创建人</div>
                  <div className="text-[#e8f1ff]">{selected.creator_name || '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8b9bb4]">截止时间</div>
                  <div className="text-[#e8f1ff]">{formatTime(selected.due_at)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8b9bb4]">关联告警</div>
                  <Link
                    href="/alerts/records"
                    className="text-[#3b82f6] font-mono hover:underline"
                  >
                    {selected.alert_id || selected.alert}
                  </Link>
                </div>
              </div>
              {selected.description && (
                <div>
                  <div className="text-[10px] text-[#8b9bb4]">说明</div>
                  <div className="text-[#e8f1ff] whitespace-pre-wrap">{selected.description}</div>
                </div>
              )}
              {selected.result_note && (
                <div>
                  <div className="text-[10px] text-[#8b9bb4]">处理结果</div>
                  <div className="text-[#e8f1ff] whitespace-pre-wrap">{selected.result_note}</div>
                </div>
              )}

              {message && (
                <div className="p-2 bg-[#3b82f6]/10 border border-[#3b82f6]/30 rounded text-[#93c5fd]">
                  {message}
                </div>
              )}

              {['pending', 'accepted', 'in_progress'].includes(String(selected.status)) && (
                <div>
                  <div className="text-[10px] text-[#8b9bb4] mb-1">完成备注</div>
                  <textarea
                    value={completeNote}
                    onChange={(e) => setCompleteNote(e.target.value)}
                    rows={2}
                    className="w-full px-2 py-1.5 text-xs bg-[#0f1e35] border border-[#1e3a5f] rounded text-[#e8f1ff]"
                    placeholder="现场处置结果…"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {selected.status === 'pending' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => void runAction(() => acceptWorkOrder(selected.id), '已接单')}
                    className="px-3 py-1.5 bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] disabled:opacity-50"
                  >
                    接单
                  </button>
                )}
                {(selected.status === 'pending' || selected.status === 'accepted') && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => void runAction(() => startWorkOrder(selected.id), '已开始处理')}
                    className="px-3 py-1.5 bg-[#06b6d4] text-white rounded hover:bg-[#0891b2] disabled:opacity-50"
                  >
                    开始处理
                  </button>
                )}
                {['pending', 'accepted', 'in_progress'].includes(String(selected.status)) && (
                  <>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() =>
                        void runAction(
                          () =>
                            completeWorkOrder(selected.id, {
                              note: completeNote || '现场已控制',
                              closeAlert: true,
                              alertStatus: 'resolved',
                            }),
                          '工单已完成'
                        )
                      }
                      className="px-3 py-1.5 bg-[#10b981] text-white rounded hover:bg-[#059669] disabled:opacity-50"
                    >
                      完成并关告警
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() =>
                        void runAction(
                          () => cancelWorkOrder(selected.id, completeNote || '工单已取消'),
                          '工单已取消'
                        )
                      }
                      className="px-3 py-1.5 border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#ef4444] hover:text-[#ef4444] disabled:opacity-50"
                    >
                      取消
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WorkOrdersPage() {
  return (
    <AuthGuard>
      <WorkOrdersContent />
    </AuthGuard>
  );
}
