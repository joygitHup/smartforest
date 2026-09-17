'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import ConfirmDeleteDialog from '@/components/ui/confirm-delete-dialog';
import Pagination, { usePagination } from '@/components/ui/pagination';
import {
  createUser,
  deleteUser,
  DEFAULT_RESET_PASSWORD,
  getOrganizations,
  getRoles,
  getUsers,
  resetUserPassword,
  toggleUserActive,
  updateUser,
  type CreateUserData,
  type Organization,
  type OrgUser,
  type Role,
  type UpdateUserData,
} from '@/lib/api/organization';
import { useAuth, canResetUserPassword, isPlatformAdmin } from '@/contexts/AuthContext';

type UserForm = {
  username: string;
  password: string;
  password_confirm: string;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  role_ref_id: number | '';
  organization_id: number | '';
  department: string;
  region: string;
  is_active: boolean;
};

const emptyForm: UserForm = {
  username: '',
  password: '',
  password_confirm: '',
  email: '',
  phone: '',
  first_name: '',
  last_name: '',
  role_ref_id: '',
  organization_id: '',
  department: '',
  region: '',
  is_active: true,
};

function UsersPageContent() {
  const { user: currentUser } = useAuth();
  const canResetPassword = canResetUserPassword(currentUser);
  const platformAdmin = isPlatformAdmin(currentUser);
  const [items, setItems] = useState<OrgUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OrgUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<OrgUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [resetTarget, setResetTarget] = useState<OrgUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [useDefaultReset, setUseDefaultReset] = useState(true);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const { current, pageSize, onPageChange, onPageSizeChange } = usePagination(10);

  const fetchMeta = useCallback(async () => {
    const [orgRes, roleRes] = await Promise.all([
      getOrganizations({ page: 1, page_size: 200 }),
      getRoles({ page: 1, page_size: 200, is_enabled: true }),
    ]);
    setOrgs(orgRes.results);
    setRoles(roleRes.results);
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getUsers({
        page: current,
        page_size: pageSize,
        search: search || undefined,
        organization: orgFilter ? Number(orgFilter) : undefined,
        role_ref: roleFilter ? Number(roleFilter) : undefined,
      });
      setItems(res.results);
      setTotal(res.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取用户失败');
    } finally {
      setLoading(false);
    }
  }, [current, pageSize, search, orgFilter, roleFilter]);

  useEffect(() => {
    void fetchMeta().catch(() => undefined);
  }, [fetchMeta]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    const t = setTimeout(() => {
      onPageChange(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search, orgFilter, roleFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (user: OrgUser) => {
    setEditing(user);
    setForm({
      username: user.username,
      password: '',
      password_confirm: '',
      email: user.email || '',
      phone: user.phone || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role_ref_id: user.role_ref ?? '',
      organization_id: user.organization ?? '',
      department: user.department || '',
      region: user.region || '',
      is_active: user.is_active,
    });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError('');
    try {
      const roleId = form.role_ref_id === '' ? null : Number(form.role_ref_id);
      const orgId = form.organization_id === '' ? null : Number(form.organization_id);
      const selectedRole = roles.find((r) => r.id === roleId);
      // 兼容旧枚举字段；自定义角色编码（如 KPJ-forester）只走 role_ref_id
      const legacyRoles = new Set(['admin', 'operator', 'forester', 'viewer']);
      const legacyRole =
        selectedRole && legacyRoles.has(selectedRole.code) ? selectedRole.code : 'viewer';

      if (editing) {
        const payload: UpdateUserData = {
          email: form.email,
          phone: form.phone,
          first_name: form.first_name,
          last_name: form.last_name,
          role_ref_id: roleId,
          organization_id: orgId,
          department: form.department,
          region: form.region,
          is_active: form.is_active,
          role: legacyRole,
        };
        await updateUser(editing.id, payload);
      } else {
        if (!form.username.trim() || !form.password) {
          setFormError('用户名和密码必填');
          setSaving(false);
          return;
        }
        if (form.password !== form.password_confirm) {
          setFormError('两次密码不一致');
          setSaving(false);
          return;
        }
        const payload: CreateUserData = {
          username: form.username.trim(),
          password: form.password,
          password_confirm: form.password_confirm,
          email: form.email,
          phone: form.phone,
          first_name: form.first_name,
          last_name: form.last_name,
          role_ref_id: roleId,
          organization_id: orgId,
          department: form.department,
          region: form.region,
          role: legacyRole,
        };
        await createUser(payload);
      }
      setDialogOpen(false);
      await fetchList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (user: OrgUser) => {
    try {
      await toggleUserActive(user.id);
      await fetchList();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '操作失败');
    }
  };

  const openResetPassword = (user: OrgUser) => {
    setResetTarget(user);
    setUseDefaultReset(true);
    setResetPassword('');
    setResetError('');
    setResetSuccess('');
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    setResetLoading(true);
    setResetError('');
    setResetSuccess('');
    try {
      const custom = useDefaultReset ? undefined : resetPassword.trim();
      if (!useDefaultReset && !custom) {
        setResetError('请输入新密码，或勾选使用默认密码');
        setResetLoading(false);
        return;
      }
      const res = await resetUserPassword(resetTarget.id, custom);
      setResetSuccess(
        res.used_default_password
          ? `已重置为默认密码 ${DEFAULT_RESET_PASSWORD}，用户下次登录须修改密码`
          : '已重置为自定义密码，用户下次登录须修改密码'
      );
      await fetchList();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : '重置失败');
    } finally {
      setResetLoading(false);
    }
  };

  const askDelete = (user: OrgUser) => {
    setDeleteError('');
    setDeleting(user);
  };

  const handleDeleteConfirm = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await deleteUser(deleting.id);
      setDeleting(null);
      await fetchList();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[#e8f1ff]">用户管理</h1>
          {canResetPassword && (
            <p className="text-[11px] text-[#8b9bb4] mt-1">
              {platformAdmin
                ? '平台管理员可重置全平台用户密码'
                : `组织管理员仅可重置「${currentUser?.org_scope?.scope_label || currentUser?.organization_name || '本组织'}」内用户密码`}
              ；个人请在个人中心修改自己的密码。
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-3 py-1.5 rounded text-xs bg-[#3b82f6] text-white hover:bg-[#2563eb]"
        >
          新增用户
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索用户名/姓名/手机"
          className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] w-56"
        />
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff]"
        >
          <option value="">全部组织</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff]"
        >
          <option value="">全部角色</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0f1e35] text-[#8b9bb4]">
              <tr>
                <th className="text-left px-3 py-2 font-medium">用户名</th>
                <th className="text-left px-3 py-2 font-medium">姓名</th>
                <th className="text-left px-3 py-2 font-medium">组织</th>
                <th className="text-left px-3 py-2 font-medium">角色</th>
                <th className="text-left px-3 py-2 font-medium">手机</th>
                <th className="text-left px-3 py-2 font-medium">部门</th>
                <th className="text-left px-3 py-2 font-medium">状态</th>
                <th className="text-right px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-[#8b9bb4]">
                    加载中...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-[#8b9bb4]">
                    暂无用户数据
                  </td>
                </tr>
              ) : (
                items.map((user) => (
                  <tr key={user.id} className="border-t border-[#1e3a5f]/60 hover:bg-[#0f1e35]/50">
                    <td className="px-3 py-2 text-[#e8f1ff] font-mono">{user.username}</td>
                    <td className="px-3 py-2 text-[#8b9bb4]">{user.full_name || '-'}</td>
                    <td className="px-3 py-2 text-[#8b9bb4]">{user.organization_name || '-'}</td>
                    <td className="px-3 py-2 text-[#8b9bb4]">
                      {user.role_ref_name || user.role_display || user.role}
                    </td>
                    <td className="px-3 py-2 font-mono text-[#8b9bb4]">{user.phone || '-'}</td>
                    <td className="px-3 py-2 text-[#8b9bb4]">{user.department || '-'}</td>
                    <td className="px-3 py-2">
                      <span className={user.is_active ? 'text-[#10b981]' : 'text-[#8b9bb4]'}>
                        {user.is_active ? '启用' : '停用'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(user)}
                        className="text-[#3b82f6] hover:underline"
                      >
                        编辑
                      </button>
                      {canResetPassword && currentUser?.id !== user.id && (
                        <button
                          type="button"
                          onClick={() => openResetPassword(user)}
                          className="text-[#06b6d4] hover:underline"
                        >
                          重置密码
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleToggle(user)}
                        className="text-[#f59e0b] hover:underline"
                      >
                        {user.is_active ? '停用' : '启用'}
                      </button>
                      <button
                        type="button"
                        onClick={() => askDelete(user)}
                        className="text-[#ef4444] hover:underline"
                      >
                        删除
                      </button>
                      {user.must_change_password && (
                        <span className="text-[10px] text-[#f59e0b] ml-1">待改密</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          current={current}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </div>

      <ConfirmDeleteDialog
        open={!!deleting}
        title="删除用户"
        targetName={deleting?.username || ''}
        loading={deleteLoading}
        error={deleteError}
        onCancel={() => {
          if (!deleteLoading) {
            setDeleting(null);
            setDeleteError('');
          }
        }}
        onConfirm={() => void handleDeleteConfirm()}
      />

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-[#152238] border border-[#1e3a5f] rounded-lg p-5 space-y-3">
            <div className="text-sm font-medium text-[#e8f1ff]">
              重置密码 · {resetTarget.username}
            </div>
            <p className="text-[11px] text-[#8b9bb4]">
              {platformAdmin
                ? '平台管理员可重置任意用户。'
                : '仅可重置本组织范围内用户。'}
              重置后用户下次登录须修改密码。默认密码：
              <span className="font-mono text-[#f59e0b] ml-1">{DEFAULT_RESET_PASSWORD}</span>
            </p>
            <label className="inline-flex items-center gap-2 text-xs text-[#e8f1ff]">
              <input
                type="checkbox"
                checked={useDefaultReset}
                onChange={(e) => setUseDefaultReset(e.target.checked)}
              />
              使用默认密码 {DEFAULT_RESET_PASSWORD}
            </label>
            {!useDefaultReset && (
              <input
                type="text"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="输入自定义新密码"
                className="w-full px-3 py-2 text-xs bg-[#0f1e35] border border-[#1e3a5f] rounded text-[#e8f1ff]"
              />
            )}
            {resetError && (
              <div className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded px-3 py-2">
                {resetError}
              </div>
            )}
            {resetSuccess && (
              <div className="text-xs text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/30 rounded px-3 py-2">
                {resetSuccess}
              </div>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                disabled={resetLoading}
                onClick={() => setResetTarget(null)}
                className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded"
              >
                {resetSuccess ? '关闭' : '取消'}
              </button>
              {!resetSuccess && (
                <button
                  type="button"
                  disabled={resetLoading}
                  onClick={() => void handleResetPassword()}
                  className="px-3 py-1.5 text-xs bg-[#06b6d4] text-white rounded disabled:opacity-50"
                >
                  {resetLoading ? '重置中…' : '确认重置'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg bg-[#152238] border border-[#1e3a5f] rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[#e8f1ff]">
              {editing ? '编辑用户' : '新增用户'}
            </h2>
            {formError && <p className="text-xs text-[#ef4444]">{formError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>用户名 *</span>
                <input
                  value={form.username}
                  disabled={!!editing}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff] disabled:opacity-60"
                />
              </label>
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>手机</span>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </label>
              {!editing && (
                <>
                  <label className="text-[10px] text-[#8b9bb4] space-y-1">
                    <span>密码 *</span>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                    />
                  </label>
                  <label className="text-[10px] text-[#8b9bb4] space-y-1">
                    <span>确认密码 *</span>
                    <input
                      type="password"
                      value={form.password_confirm}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, password_confirm: e.target.value }))
                      }
                      className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                    />
                  </label>
                </>
              )}
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>姓</span>
                <input
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </label>
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>名</span>
                <input
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </label>
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>邮箱</span>
                <input
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </label>
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>部门</span>
                <input
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </label>
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>所属组织</span>
                <select
                  value={form.organization_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      organization_id: e.target.value ? Number(e.target.value) : '',
                    }))
                  }
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                >
                  <option value="">未分配</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>角色</span>
                <select
                  value={form.role_ref_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      role_ref_id: e.target.value ? Number(e.target.value) : '',
                    }))
                  }
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                >
                  <option value="">未分配</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>负责区域</span>
                <input
                  value={form.region}
                  onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </label>
              {editing && (
                <label className="flex items-center gap-2 text-xs text-[#e8f1ff]">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  />
                  启用账号
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="px-3 py-1.5 rounded text-xs text-[#8b9bb4] hover:bg-[#0f1e35]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="px-3 py-1.5 rounded text-xs bg-[#3b82f6] text-white disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UsersPage() {
  return (
    <AuthGuard>
      <UsersPageContent />
    </AuthGuard>
  );
}
