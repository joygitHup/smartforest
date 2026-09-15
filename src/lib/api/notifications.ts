import { apiUrl } from '@/lib/api/config';
import { authFetch } from '@/lib/auth';

export interface InAppNotification {
  id: number;
  type: string;
  notification_type: string;
  type_display: string;
  title: string;
  content: string;
  is_read: boolean;
  alert_id: string;
  device_id: string;
  created_at: string;
  read_at: string | null;
}

export interface NotificationListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: InAppNotification[];
}

async function parseError(response: Response, fallback: string): Promise<string> {
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.detail === 'string') return record.detail;
  if (typeof record.error === 'string') return record.error;
  if (typeof record.message === 'string') return record.message;
  return fallback;
}

const BASE = '/api/users/notifications';

export async function getNotifications(params?: {
  page?: number;
  page_size?: number;
  is_read?: boolean;
}): Promise<NotificationListResponse> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.page_size) sp.set('page_size', String(params.page_size ?? 20));
  if (typeof params?.is_read === 'boolean') sp.set('is_read', String(params.is_read));
  const q = sp.toString();
  const res = await authFetch(apiUrl(q ? `${BASE}/?${q}` : `${BASE}/`), { method: 'GET' });
  if (!res.ok) throw new Error(await parseError(res, '获取站内信失败'));
  return res.json() as Promise<NotificationListResponse>;
}

export async function getUnreadNotificationCount(): Promise<number> {
  const res = await authFetch(apiUrl(`${BASE}/unread_count/`), { method: 'GET' });
  if (!res.ok) throw new Error(await parseError(res, '获取未读数失败'));
  const data = (await res.json()) as { unread_count?: number };
  return Number(data.unread_count ?? 0);
}

export async function markNotificationsRead(notificationIds?: number[]): Promise<number> {
  const res = await authFetch(apiUrl(`${BASE}/mark_read/`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      notificationIds && notificationIds.length > 0
        ? { notification_ids: notificationIds }
        : {}
    ),
  });
  if (!res.ok) throw new Error(await parseError(res, '标记已读失败'));
  const data = (await res.json()) as { count?: number };
  return Number(data.count ?? 0);
}

export async function markNotificationRead(id: number): Promise<void> {
  const res = await authFetch(apiUrl(`${BASE}/${id}/mark_read_single/`), {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await parseError(res, '标记已读失败'));
}

export async function clearReadNotifications(): Promise<number> {
  const res = await authFetch(apiUrl(`${BASE}/clear_read/`), { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseError(res, '清除已读失败'));
  const data = (await res.json()) as { count?: number };
  return Number(data.count ?? 0);
}
