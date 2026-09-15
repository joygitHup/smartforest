// 组织 / 角色 / 用户管理 API — 对应后端 /api/users/

import { apiUrl } from '@/lib/api/config';
import { authFetch } from '@/lib/auth';

export interface Organization {
  id: number;
  name: string;
  code: string;
  parent: number | null;
  parent_name?: string | null;
  org_type: string;
  org_type_display?: string;
  region?: string;
  contact?: string;
  phone?: string;
  address?: string;
  description?: string;
  sort_order?: number;
  is_active: boolean;
  children_count?: number;
  user_count?: number;
  children?: Organization[];
  created_at?: string;
  updated_at?: string;
}

export interface Role {
  id: number;
  name: string;
  code: string;
  description?: string;
  permissions: string[];
  is_system: boolean;
  is_enabled: boolean;
  organization?: number | null;
  organization_name?: string | null;
  user_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PermissionItem {
  code: string;
  name: string;
  module: string;
}

export interface OrgUser {
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
  created_at?: string;
  unread_count?: number;
}

export interface PaginatedResponse<T> {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

export interface CreateOrganizationData {
  name: string;
  code: string;
  parent?: number | null;
  org_type?: string;
  region?: string;
  contact?: string;
  phone?: string;
  address?: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface CreateRoleData {
  name: string;
  code: string;
  description?: string;
  permissions?: string[];
  is_enabled?: boolean;
}

export interface CreateUserData {
  username: string;
  password: string;
  password_confirm: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  role_ref_id?: number | null;
  organization_id?: number | null;
  department?: string;
  region?: string;
  badge_number?: string;
  patrol_zone?: string;
}

export interface UpdateUserData {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  role_ref_id?: number | null;
  organization_id?: number | null;
  department?: string;
  region?: string;
  badge_number?: string;
  patrol_zone?: string;
  is_active?: boolean;
}

const ORGS_BASE = '/api/users/organizations';
const ROLES_BASE = '/api/users/roles';
const USERS_BASE = '/api/users/users';

async function parseError(response: Response, fallback: string): Promise<string> {
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.detail === 'string') return record.detail;
  if (typeof record.error === 'string') return record.error;
  const firstKey = Object.keys(record)[0];
  const firstVal = firstKey ? record[firstKey] : null;
  if (Array.isArray(firstVal) && typeof firstVal[0] === 'string') {
    return `${firstKey}: ${firstVal[0]}`;
  }
  if (typeof firstVal === 'string') return firstVal;
  return fallback;
}

function listUrl(base: string, params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return apiUrl(`${base}/`);
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    q.set(k, String(v));
  });
  const query = q.toString();
  return apiUrl(query ? `${base}/?${query}` : `${base}/`);
}

/* —— 组织 —— */

export async function getOrganizations(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  org_type?: string;
  is_active?: boolean;
  parent?: number;
}): Promise<PaginatedResponse<Organization>> {
  const response = await authFetch(listUrl(ORGS_BASE, params));
  if (!response.ok) throw new Error(await parseError(response, '获取组织列表失败'));
  return response.json();
}

export async function getOrganizationTree(): Promise<Organization[]> {
  const response = await authFetch(apiUrl(`${ORGS_BASE}/tree/`));
  if (!response.ok) throw new Error(await parseError(response, '获取组织树失败'));
  return response.json();
}

export async function getOrganization(id: number): Promise<Organization> {
  const response = await authFetch(apiUrl(`${ORGS_BASE}/${id}/`));
  if (!response.ok) throw new Error(await parseError(response, '获取组织详情失败'));
  return response.json();
}

export async function createOrganization(data: CreateOrganizationData): Promise<Organization> {
  const response = await authFetch(apiUrl(`${ORGS_BASE}/`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await parseError(response, '创建组织失败'));
  return response.json();
}

export async function updateOrganization(
  id: number,
  data: Partial<CreateOrganizationData>
): Promise<Organization> {
  const response = await authFetch(apiUrl(`${ORGS_BASE}/${id}/`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await parseError(response, '更新组织失败'));
  return response.json();
}

export async function deleteOrganization(id: number): Promise<void> {
  const response = await authFetch(apiUrl(`${ORGS_BASE}/${id}/`), { method: 'DELETE' });
  if (!response.ok) throw new Error(await parseError(response, '删除组织失败'));
}

/* —— 角色 —— */

export async function getRoles(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  is_enabled?: boolean;
  is_system?: boolean;
}): Promise<PaginatedResponse<Role>> {
  const response = await authFetch(listUrl(ROLES_BASE, params));
  if (!response.ok) throw new Error(await parseError(response, '获取角色列表失败'));
  return response.json();
}

export async function getRole(id: number): Promise<Role> {
  const response = await authFetch(apiUrl(`${ROLES_BASE}/${id}/`));
  if (!response.ok) throw new Error(await parseError(response, '获取角色详情失败'));
  return response.json();
}

export async function getPermissionCatalog(): Promise<PermissionItem[]> {
  const response = await authFetch(apiUrl(`${ROLES_BASE}/permission_catalog/`));
  if (!response.ok) throw new Error(await parseError(response, '获取权限目录失败'));
  return response.json();
}

export async function createRole(data: CreateRoleData): Promise<Role> {
  const response = await authFetch(apiUrl(`${ROLES_BASE}/`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await parseError(response, '创建角色失败'));
  return response.json();
}

export async function updateRole(id: number, data: Partial<CreateRoleData>): Promise<Role> {
  const response = await authFetch(apiUrl(`${ROLES_BASE}/${id}/`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await parseError(response, '更新角色失败'));
  return response.json();
}

export async function deleteRole(id: number): Promise<void> {
  const response = await authFetch(apiUrl(`${ROLES_BASE}/${id}/`), { method: 'DELETE' });
  if (!response.ok) throw new Error(await parseError(response, '删除角色失败'));
}

/* —— 用户 —— */

export async function getUsers(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  role?: string;
  organization?: number;
  role_ref?: number;
  is_active?: boolean;
}): Promise<PaginatedResponse<OrgUser>> {
  const response = await authFetch(listUrl(USERS_BASE, params));
  if (!response.ok) throw new Error(await parseError(response, '获取用户列表失败'));
  return response.json();
}

export async function getUser(id: number): Promise<OrgUser> {
  const response = await authFetch(apiUrl(`${USERS_BASE}/${id}/`));
  if (!response.ok) throw new Error(await parseError(response, '获取用户详情失败'));
  return response.json();
}

export async function createUser(data: CreateUserData): Promise<OrgUser> {
  const response = await authFetch(apiUrl(`${USERS_BASE}/`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await parseError(response, '创建用户失败'));
  return response.json();
}

export async function updateUser(id: number, data: UpdateUserData): Promise<OrgUser> {
  const response = await authFetch(apiUrl(`${USERS_BASE}/${id}/`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await parseError(response, '更新用户失败'));
  return response.json();
}

export async function deleteUser(id: number): Promise<void> {
  const response = await authFetch(apiUrl(`${USERS_BASE}/${id}/`), { method: 'DELETE' });
  if (!response.ok) throw new Error(await parseError(response, '删除用户失败'));
}

export async function toggleUserActive(id: number): Promise<{ is_active: boolean; message: string }> {
  const response = await authFetch(apiUrl(`${USERS_BASE}/${id}/toggle_active/`), {
    method: 'POST',
  });
  if (!response.ok) throw new Error(await parseError(response, '切换用户状态失败'));
  return response.json();
}

/** 系统管理员重置用户密码，默认 Qwe123456 */
export async function resetUserPassword(
  id: number,
  newPassword?: string
): Promise<{
  message: string;
  username: string;
  must_change_password: boolean;
  used_default_password: boolean;
  default_password_hint?: string | null;
}> {
  const body: Record<string, string> = {};
  if (newPassword && newPassword.trim()) {
    body.new_password = newPassword.trim();
  }
  const response = await authFetch(apiUrl(`${USERS_BASE}/${id}/reset_password/`), {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await parseError(response, '重置密码失败'));
  return response.json();
}

export const DEFAULT_RESET_PASSWORD = 'Qwe123456';

/* —— 林区 —— */

const FOREST_ZONES_BASE = '/api/users/forest-zones';

export interface ForestZone {
  id: number;
  name: string;
  code: string;
  organization: number;
  organization_name?: string | null;
  region?: string;
  boundary?: Record<string, unknown>;
  manager?: string;
  contact?: string;
  description?: string;
  sort_order?: number;
  is_active: boolean;
  device_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ForestZoneOption {
  id: number;
  name: string;
  code: string;
  organization_id: number;
  region?: string;
  device_count?: number;
}

export interface CreateForestZoneData {
  name: string;
  code: string;
  organization?: number | null;
  region?: string;
  boundary?: Record<string, unknown>;
  manager?: string;
  contact?: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
}

export async function getForestZones(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  organization?: number;
  is_active?: boolean;
}): Promise<PaginatedResponse<ForestZone>> {
  const response = await authFetch(listUrl(FOREST_ZONES_BASE, params));
  if (!response.ok) throw new Error(await parseError(response, '获取林区列表失败'));
  return response.json();
}

export async function getForestZoneOptions(organizationId?: number): Promise<ForestZoneOption[]> {
  const q = new URLSearchParams();
  if (organizationId) q.set('organization_id', String(organizationId));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const response = await authFetch(apiUrl(`${FOREST_ZONES_BASE}/options_list/${suffix}`));
  if (!response.ok) throw new Error(await parseError(response, '获取林区选项失败'));
  const data = (await response.json()) as { results?: ForestZoneOption[] };
  return data.results || [];
}

export async function createForestZone(data: CreateForestZoneData): Promise<ForestZone> {
  const response = await authFetch(apiUrl(`${FOREST_ZONES_BASE}/`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await parseError(response, '创建林区失败'));
  return response.json();
}

export async function updateForestZone(
  id: number,
  data: Partial<CreateForestZoneData>
): Promise<ForestZone> {
  const response = await authFetch(apiUrl(`${FOREST_ZONES_BASE}/${id}/`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await parseError(response, '更新林区失败'));
  return response.json();
}

export async function deleteForestZone(id: number): Promise<void> {
  const response = await authFetch(apiUrl(`${FOREST_ZONES_BASE}/${id}/`), { method: 'DELETE' });
  if (!response.ok) throw new Error(await parseError(response, '删除林区失败'));
}
