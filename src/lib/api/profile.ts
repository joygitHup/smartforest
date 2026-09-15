import { apiUrl } from './config';
import { authFetch } from '@/lib/auth';

/** 当前登录用户资料（GET /api/users/users/profile/） */
export interface OrgScopeInfo {
  unrestricted: boolean;
  organization_id?: number | null;
  organization_name?: string | null;
  organization_code?: string | null;
  scope_org_ids?: number[] | null;
  scope_label?: string | null;
}

export interface UserProfile {
  id: number;
  username: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  role: string;
  role_display?: string;
  role_ref?: number | null;
  role_ref_name?: string | null;
  organization?: number | null;
  organization_name?: string | null;
  department?: string;
  region?: string;
  badge_number?: string;
  patrol_zone?: string;
  is_active: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  must_change_password?: boolean;
  last_login?: string | null;
  date_joined?: string;
  org_scope?: OrgScopeInfo | null;
}

export interface UpdateProfileData {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  department?: string;
  region?: string;
}

export interface ChangePasswordData {
  old_password?: string;
  new_password: string;
  new_password_confirm: string;
}

async function parseError(response: Response, fallback: string): Promise<string> {
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.detail === 'string') return record.detail;
  if (typeof record.message === 'string') return record.message;
  if (Array.isArray(record.non_field_errors) && typeof record.non_field_errors[0] === 'string') {
    return record.non_field_errors[0];
  }
  for (const key of [
    'old_password',
    'new_password',
    'new_password_confirm',
    'email',
    'phone',
  ]) {
    const val = record[key];
    if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
    if (typeof val === 'string') return val;
  }
  return fallback;
}

const PROFILE_BASE = '/api/users/users';

/** GET /api/users/users/profile/ */
export async function getUserProfile(): Promise<UserProfile> {
  const response = await authFetch(apiUrl(`${PROFILE_BASE}/profile/`));
  if (!response.ok) {
    throw new Error(await parseError(response, '获取个人信息失败'));
  }
  return response.json() as Promise<UserProfile>;
}

/** PATCH /api/users/users/update_profile/ */
export async function updateUserProfile(data: UpdateProfileData): Promise<UserProfile> {
  const response = await authFetch(apiUrl(`${PROFILE_BASE}/update_profile/`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '更新个人信息失败'));
  }
  return response.json() as Promise<UserProfile>;
}

/** POST /api/users/users/change_password/ */
export async function changeUserPassword(data: ChangePasswordData): Promise<void> {
  const response = await authFetch(apiUrl(`${PROFILE_BASE}/change_password/`), {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '修改密码失败'));
  }
}
