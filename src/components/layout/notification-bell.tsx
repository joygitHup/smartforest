'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  clearReadNotifications,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markNotificationsRead,
  type InAppNotification,
} from '@/lib/api/notifications';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemSettings } from '@/contexts/SystemSettingsContext';
import { cn } from '@/lib/utils';

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export default function NotificationBell() {
  const { user } = useAuth();
  const { settings, hydrated } = useSystemSettings();
  const inAppEnabled = !hydrated || settings.notification.inApp;

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refreshUnread = useCallback(async () => {
    if (!user || !inAppEnabled) {
      setUnread(0);
      return;
    }
    try {
      const count = await getUnreadNotificationCount();
      setUnread(count);
    } catch {
      // 静默：未登录/接口短暂失败不打扰顶栏
    }
  }, [user, inAppEnabled]);

  const loadList = useCallback(async () => {
    if (!user || !inAppEnabled) return;
    setLoading(true);
    setError('');
    try {
      const res = await getNotifications({ page: 1, page_size: 15 });
      setItems(res.results || []);
      const unreadCount = (res.results || []).filter((n) => !n.is_read).length;
      // 列表未覆盖全部未读时仍拉一次总数
      if (res.count > (res.results?.length || 0)) {
        await refreshUnread();
      } else {
        setUnread(unreadCount);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载站内信失败');
    } finally {
      setLoading(false);
    }
  }, [user, inAppEnabled, refreshUnread]);

  useEffect(() => {
    void refreshUnread();
    const timer = setInterval(() => {
      void refreshUnread();
    }, 30000);
    const onInApp = () => {
      void refreshUnread();
    };
    window.addEventListener('sf:in-app', onInApp);
    return () => {
      clearInterval(timer);
      window.removeEventListener('sf:in-app', onInApp);
    };
  }, [refreshUnread]);

  useEffect(() => {
    if (open) void loadList();
  }, [open, loadList]);

  if (!user || !inAppEnabled) {
    return null;
  }

  const handleOpenItem = async (n: InAppNotification) => {
    if (!n.is_read) {
      try {
        await markNotificationRead(n.id);
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
        );
        setUnread((c) => Math.max(0, c - 1));
      } catch {
        // ignore
      }
    }
  };

  const handleMarkAll = async () => {
    try {
      await markNotificationsRead();
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
      setUnread(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : '全部已读失败');
    }
  };

  const handleClearRead = async () => {
    try {
      await clearReadNotifications();
      setItems((prev) => prev.filter((x) => !x.is_read));
    } catch (err) {
      setError(err instanceof Error ? err.message : '清除已读失败');
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-[#8b9bb4] hover:bg-[#152238] hover:text-[#e8f1ff] outline-none focus-visible:ring-1 focus-visible:ring-[#3b82f6]"
          title="站内信"
          aria-label="站内信"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-medium text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[360px] max-h-[440px] overflow-hidden p-0 bg-[#152238] border-[#1e3a5f] text-[#e8f1ff]"
      >
        <DropdownMenuLabel className="flex items-center justify-between px-3 py-2.5">
          <span className="text-xs font-medium">站内信</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-[10px] text-[#3b82f6] hover:underline disabled:opacity-40"
              disabled={unread === 0}
              onClick={(e) => {
                e.preventDefault();
                void handleMarkAll();
              }}
            >
              全部已读
            </button>
            <button
              type="button"
              className="text-[10px] text-[#8b9bb4] hover:text-[#e8f1ff]"
              onClick={(e) => {
                e.preventDefault();
                void handleClearRead();
              }}
            >
              清除已读
            </button>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[#1e3a5f] m-0" />

        <div className="max-h-[340px] overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-[#8b9bb4]">加载中…</div>
          ) : error ? (
            <div className="px-3 py-6 text-center text-xs text-[#ef4444]">{error}</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-[#8b9bb4]">暂无站内信</div>
          ) : (
            items.map((n) => {
              const href = n.alert_id ? `/alerts/handling` : undefined;
              const body = (
                <div className="flex flex-col gap-0.5 w-full min-w-0">
                  <div className="flex items-start gap-2">
                    {!n.is_read ? (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3b82f6]" />
                    ) : (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          'text-xs truncate',
                          n.is_read ? 'text-[#8b9bb4]' : 'text-[#e8f1ff] font-medium'
                        )}
                      >
                        {n.title}
                      </div>
                      {n.content ? (
                        <div className="text-[10px] text-[#8b9bb4] line-clamp-2 mt-0.5">
                          {n.content}
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-[#5a6f8f]">
                        <span>{n.type_display || n.type}</span>
                        <span>·</span>
                        <span className="font-mono">{formatTime(n.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );

              if (href) {
                return (
                  <DropdownMenuItem
                    key={n.id}
                    asChild
                    className="rounded-none px-3 py-2.5 focus:bg-[#0f1e35] focus:text-[#e8f1ff] cursor-pointer"
                  >
                    <Link
                      href={href}
                      onClick={() => {
                        void handleOpenItem(n);
                      }}
                    >
                      {body}
                    </Link>
                  </DropdownMenuItem>
                );
              }

              return (
                <DropdownMenuItem
                  key={n.id}
                  className="rounded-none px-3 py-2.5 focus:bg-[#0f1e35] focus:text-[#e8f1ff] cursor-pointer"
                  onSelect={() => {
                    void handleOpenItem(n);
                  }}
                >
                  {body}
                </DropdownMenuItem>
              );
            })
          )}
        </div>

        <DropdownMenuSeparator className="bg-[#1e3a5f] m-0" />
        <div className="px-3 py-2 text-[10px] text-[#5a6f8f]">
          推送渠道可在{' '}
          <Link href="/settings" className="text-[#3b82f6] hover:underline">
            系统设置 · 通知设置
          </Link>{' '}
          中开关站内信
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
