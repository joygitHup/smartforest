'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import ConfirmDeleteDialog from '@/components/ui/confirm-delete-dialog';
import Pagination, { usePagination } from '@/components/ui/pagination';
import {
  createRole,
  deleteRole,
  getPermissionCatalog,
  getRoles,
  updateRole,
  type CreateRoleData,
  type PermissionItem,
  type Role,
} from '@/lib/api/organization';

const emptyForm: CreateRoleData = {
  name: '',
  code: '',
  description: '',
  permissions: [],
  is_enabled: true,
};

function RolesPageContent() {
  const [items, setItems] = useState<Role[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [catalog, setCatalog] = useState<PermissionItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState<CreateRoleData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Role | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const { current, pageSize, onPageChange, onPageSizeChange } = usePagination(10);

  const groupedCatalog = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    catalog.forEach((p) => {
      const list = map.get(p.module) || [];
      list.push(p);
      map.set(p.module, list);
    });
    return Array.from(map.entries());
  }, [catalog]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getRoles({
        page: current,
        page_size: pageSize,
        search: search || undefined,
      });
      setItems(res.results);
      setTotal(res.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取角色失败');
    } finally {
      setLoading(false);
    }
  }, [current, pageSize, search]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    void getPermissionCatalog()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      onPageChange(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditing(role);
    setForm({
      name: role.name,
      code: role.code,
      description: role.description || '',
      permissions: [...(role.permissions || [])],
      is_enabled: role.is_enabled,
    });
    setFormError('');
    setDialogOpen(true);
  };

  const togglePerm = (code: string) => {
    setForm((f) => {
      const set = new Set(f.permissions || []);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return { ...f, permissions: Array.from(set) };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      setFormError('名称和编码必填');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        const payload: Partial<CreateRoleData> = {
          name: form.name,
          description: form.description,
          permissions: form.permissions,
          is_enabled: form.is_enabled,
        };
        if (!editing.is_system) payload.code = form.code;
        await updateRole(editing.id, payload);
      } else {
        await createRole(form);
      }
      setDialogOpen(false);
      await fetchList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const askDelete = (role: Role) => {
    if (role.is_system) return;
    setDeleteError('');
    setDeleting(role);
  };

  const handleDeleteConfirm = async () => {
    if (!deleting || deleting.is_system) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await deleteRole(deleting.id);
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
          <h1 className="text-lg font-semibold text-[#e8f1ff]">角色管理</h1>
          <p className="text-[10px] text-[#8b9bb4] mt-0.5">
            平台管理员可看全部；下属单位可见系统默认角色与本组织（含子级）自建角色，平级单位互不可见
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-3 py-1.5 rounded text-xs bg-[#3b82f6] text-white hover:bg-[#2563eb]"
        >
          新增角色
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索角色名称/编码"
        className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] w-56"
      />

      {error && (
        <div className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#0f1e35] text-[#8b9bb4]">
              <tr>
                <th className="text-left px-3 py-2 font-medium">名称</th>
                <th className="text-left px-3 py-2 font-medium">编码</th>
                <th className="text-left px-3 py-2 font-medium">所属组织</th>
                <th className="text-left px-3 py-2 font-medium">权限数</th>
                <th className="text-left px-3 py-2 font-medium">用户数</th>
                <th className="text-left px-3 py-2 font-medium">类型</th>
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
                    暂无角色数据
                  </td>
                </tr>
              ) : (
                items.map((role) => (
                  <tr key={role.id} className="border-t border-[#1e3a5f]/60 hover:bg-[#0f1e35]/50">
                    <td className="px-3 py-2 text-[#e8f1ff]">{role.name}</td>
                    <td className="px-3 py-2 font-mono text-[#8b9bb4]">{role.code}</td>
                    <td className="px-3 py-2 text-[#8b9bb4]">
                      {role.is_system ? '系统默认' : role.organization_name || '-'}
                    </td>
                    <td className="px-3 py-2 font-mono text-[#8b9bb4]">
                      {(role.permissions || []).length}
                    </td>
                    <td className="px-3 py-2 font-mono text-[#8b9bb4]">{role.user_count ?? 0}</td>
                    <td className="px-3 py-2 text-[#8b9bb4]">
                      {role.is_system ? '系统内置' : '自定义'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={role.is_enabled ? 'text-[#10b981]' : 'text-[#8b9bb4]'}>
                        {role.is_enabled ? '启用' : '停用'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openEdit(role)}
                        className="text-[#3b82f6] hover:underline"
                      >
                        编辑
                      </button>
                      {!role.is_system && (
                        <button
                          type="button"
                          onClick={() => askDelete(role)}
                          className="text-[#ef4444] hover:underline"
                        >
                          删除
                        </button>
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
        title="删除角色"
        targetName={deleting?.name || ''}
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

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto bg-[#152238] border border-[#1e3a5f] rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[#e8f1ff]">
              {editing ? '编辑角色' : '新增角色'}
            </h2>
            {formError && <p className="text-xs text-[#ef4444]">{formError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>名称 *</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </label>
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>编码 *</span>
                <input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  disabled={!!editing?.is_system}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff] disabled:opacity-60"
                />
              </label>
              <label className="col-span-2 text-[10px] text-[#8b9bb4] space-y-1">
                <span>描述</span>
                <textarea
                  value={form.description || ''}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-[#e8f1ff]">
                <input
                  type="checkbox"
                  checked={form.is_enabled !== false}
                  onChange={(e) => setForm((f) => ({ ...f, is_enabled: e.target.checked }))}
                />
                启用
              </label>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-[#e8f1ff]">权限配置</div>
              {groupedCatalog.map(([module, perms]) => (
                <div key={module} className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
                  <div className="text-[10px] text-[#8b9bb4] mb-2 uppercase tracking-wide">{module}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {perms.map((p) => (
                      <label key={p.code} className="flex items-center gap-2 text-xs text-[#e8f1ff]">
                        <input
                          type="checkbox"
                          checked={(form.permissions || []).includes(p.code)}
                          onChange={() => togglePerm(p.code)}
                        />
                        <span>{p.name}</span>
                        <span className="font-mono text-[10px] text-[#8b9bb4]">{p.code}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
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

export default function RolesPage() {
  return (
    <AuthGuard>
      <RolesPageContent />
    </AuthGuard>
  );
}
