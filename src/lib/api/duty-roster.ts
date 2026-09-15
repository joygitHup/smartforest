/** 值班排班 API — /api/users/duty-* */

import { apiUrl } from '@/lib/api/config';
import { authFetch } from '@/lib/auth';

async function parseError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as Record<string, unknown>;
    if (typeof data.error === 'string') return data.error;
    if (typeof data.detail === 'string') return data.detail;
    if (typeof data.message === 'string') return data.message;
    const first = Object.values(data).find((v) => typeof v === 'string');
    if (typeof first === 'string') return first;
  } catch {
    /* ignore */
  }
  return fallback;
}

export interface DutyMember {
  id: number;
  username: string;
  full_name: string;
  phone?: string;
}

export interface DutyShift {
  id: number;
  organization?: number;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface DutyGroup {
  id: number;
  organization?: number | null;
  organization_name?: string | null;
  name: string;
  code?: string;
  description?: string;
  member_ids?: number[];
  members_brief?: DutyMember[];
  member_count?: number;
  is_active: boolean;
  sort_order?: number;
}

export interface DutyAssignmentItem {
  id: number;
  duty_date: string;
  shift_id: number;
  shift_name: string;
  shift_code?: string;
  group_id?: number | null;
  group_name?: string;
  user_ids: number[];
  members: DutyMember[];
  remark?: string;
}

export interface DutyCurrentSummary {
  organization_id: number;
  duty_date: string;
  now: string;
  shift: {
    id: number;
    code: string;
    name: string;
    start_time: string;
    end_time: string;
  } | null;
  group_name: string;
  members: DutyMember[];
  label: string;
}

export interface DutyRosterBundle {
  settings: {
    id: number;
    organization: number;
    organization_name?: string;
    duty_mode: string;
    duty_mode_display?: string;
  };
  shifts: DutyShift[];
  duty_mode_choices: Array<{ value: string; label: string }>;
  current: DutyCurrentSummary;
}

export async function getDutyRosterSettings(
  organizationId?: number
): Promise<DutyRosterBundle> {
  const q = organizationId ? `?organization_id=${organizationId}` : '';
  const res = await authFetch(apiUrl(`/api/users/duty-roster/settings/${q}`), {
    method: 'GET',
  });
  if (!res.ok) throw new Error(await parseError(res, '获取值班配置失败'));
  return res.json() as Promise<DutyRosterBundle>;
}

export async function updateDutyRosterMode(
  dutyMode: string,
  organizationId?: number
): Promise<DutyRosterBundle & { message?: string }> {
  const res = await authFetch(apiUrl('/api/users/duty-roster/settings/'), {
    method: 'PATCH',
    body: JSON.stringify({
      duty_mode: dutyMode,
      ...(organizationId ? { organization_id: organizationId } : {}),
    }),
  });
  if (!res.ok) throw new Error(await parseError(res, '更新排班模式失败'));
  return res.json() as Promise<DutyRosterBundle & { message?: string }>;
}

export async function getDutyCurrent(
  organizationId?: number
): Promise<DutyCurrentSummary> {
  const q = organizationId ? `?organization_id=${organizationId}` : '';
  const res = await authFetch(apiUrl(`/api/users/duty-roster/current/${q}`), {
    method: 'GET',
  });
  if (!res.ok) throw new Error(await parseError(res, '获取当前值班失败'));
  return res.json() as Promise<DutyCurrentSummary>;
}

export async function getDutyAssignments(params: {
  start: string;
  end: string;
  organization_id?: number;
}): Promise<{
  results: DutyAssignmentItem[];
  current: DutyCurrentSummary;
}> {
  const sp = new URLSearchParams();
  sp.set('start', params.start);
  sp.set('end', params.end);
  if (params.organization_id) sp.set('organization_id', String(params.organization_id));
  const res = await authFetch(
    apiUrl(`/api/users/duty-roster/assignments/?${sp.toString()}`),
    { method: 'GET' }
  );
  if (!res.ok) throw new Error(await parseError(res, '获取排班失败'));
  return res.json() as Promise<{ results: DutyAssignmentItem[]; current: DutyCurrentSummary }>;
}

export async function upsertDutyAssignment(data: {
  duty_date: string;
  shift_id: number;
  group_id?: number | null;
  user_ids?: number[];
  remark?: string;
  organization_id?: number;
}): Promise<unknown> {
  const res = await authFetch(apiUrl('/api/users/duty-roster/assignments/'), {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await parseError(res, '保存排班失败'));
  return res.json();
}

export async function getDutyGroups(params?: {
  organization_id?: number;
  page_size?: number;
}): Promise<{ count: number; results: DutyGroup[] }> {
  const sp = new URLSearchParams();
  if (params?.organization_id) sp.set('organization_id', String(params.organization_id));
  sp.set('page_size', String(params?.page_size ?? 100));
  const res = await authFetch(apiUrl(`/api/users/duty-groups/?${sp.toString()}`), {
    method: 'GET',
  });
  if (!res.ok) throw new Error(await parseError(res, '获取值班组失败'));
  return res.json() as Promise<{ count: number; results: DutyGroup[] }>;
}

export async function createDutyGroup(data: {
  name: string;
  code?: string;
  member_ids?: number[];
  description?: string;
  organization_id?: number;
}): Promise<DutyGroup> {
  const res = await authFetch(apiUrl('/api/users/duty-groups/'), {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await parseError(res, '创建值班组失败'));
  return res.json() as Promise<DutyGroup>;
}

export async function updateDutyGroup(
  id: number,
  data: Partial<{
    name: string;
    code: string;
    member_ids: number[];
    description: string;
    is_active: boolean;
  }>
): Promise<DutyGroup> {
  const res = await authFetch(apiUrl(`/api/users/duty-groups/${id}/`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await parseError(res, '更新值班组失败'));
  return res.json() as Promise<DutyGroup>;
}

export async function deleteDutyGroup(id: number): Promise<void> {
  const res = await authFetch(apiUrl(`/api/users/duty-groups/${id}/`), {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseError(res, '删除值班组失败'));
}
