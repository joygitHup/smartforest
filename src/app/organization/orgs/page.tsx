'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import ConfirmDeleteDialog from '@/components/ui/confirm-delete-dialog';
import Pagination, { usePagination } from '@/components/ui/pagination';
import {
  createOrganization,
  deleteOrganization,
  getOrganizations,
  updateOrganization,
  type CreateOrganizationData,
  type Organization,
} from '@/lib/api/organization';

const ORG_TYPES: { value: string; label: string }[] = [
  { value: 'group', label: '集团/指挥中心' },
  { value: 'bureau', label: '林业局' },
  { value: 'station', label: '管护站' },
  { value: 'team', label: '班组' },
  { value: 'other', label: '其他' },
];

const emptyForm: CreateOrganizationData = {
  name: '',
  code: '',
  parent: null,
  org_type: 'station',
  region: '',
  contact: '',
  phone: '',
  address: '',
  description: '',
  sort_order: 0,
  is_active: true,
};

function OrgsPageContent() {
  const [items, setItems] = useState<Organization[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [form, setForm] = useState<CreateOrganizationData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [parentOptions, setParentOptions] = useState<Organization[]>([]);
  const [deleting, setDeleting] = useState<Organization | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const { current, pageSize, onPageChange, onPageSizeChange } = usePagination(10);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getOrganizations({
        page: current,
        page_size: pageSize,
        search: search || undefined,
        org_type: typeFilter || undefined,
      });
      setItems(res.results);
      setTotal(res.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取组织失败');
    } finally {
      setLoading(false);
    }
  }, [current, pageSize, search, typeFilter]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    const t = setTimeout(() => {
      onPageChange(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search, typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadParents = async () => {
    const res = await getOrganizations({ page: 1, page_size: 200 });
    setParentOptions(res.results);
  };

  const openCreate = async () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setDialogOpen(true);
    try {
      await loadParents();
    } catch {
      /* ignore */
    }
  };

  const openEdit = async (org: Organization) => {
    setEditing(org);
    setForm({
      name: org.name,
      code: org.code,
      parent: org.parent,
      org_type: org.org_type,
      region: org.region || '',
      contact: org.contact || '',
      phone: org.phone || '',
      address: org.address || '',
      description: org.description || '',
      sort_order: org.sort_order ?? 0,
      is_active: org.is_active,
    });
    setFormError('');
    setDialogOpen(true);
    try {
      await loadParents();
    } catch {
      /* ignore */
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      setFormError('名称和编码必填');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        ...form,
        parent: form.parent || null,
      };
      if (editing) {
        await updateOrganization(editing.id, payload);
      } else {
        await createOrganization(payload);
      }
      setDialogOpen(false);
      await fetchList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const askDelete = (org: Organization) => {
    setDeleteError('');
    setDeleting(org);
  };

  const handleDeleteConfirm = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await deleteOrganization(deleting.id);
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
        <h1 className="text-lg font-semibold text-[#e8f1ff]">组织管理</h1>
        <button
          type="button"
          onClick={() => void openCreate()}
          className="px-3 py-1.5 rounded text-xs bg-[#3b82f6] text-white hover:bg-[#2563eb]"
        >
          新增组织
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索名称/编码/区域"
          className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] w-56"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
        >
          <option value="">全部类型</option>
          {ORG_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
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
                <th className="text-left px-3 py-2 font-medium">名称</th>
                <th className="text-left px-3 py-2 font-medium">编码</th>
                <th className="text-left px-3 py-2 font-medium">类型</th>
                <th className="text-left px-3 py-2 font-medium">上级</th>
                <th className="text-left px-3 py-2 font-medium">区域</th>
                <th className="text-left px-3 py-2 font-medium">联系人</th>
                <th className="text-left px-3 py-2 font-medium">用户数</th>
                <th className="text-left px-3 py-2 font-medium">状态</th>
                <th className="text-right px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-[#8b9bb4]">
                    加载中...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-[#8b9bb4]">
                    暂无组织数据
                  </td>
                </tr>
              ) : (
                items.map((org) => (
                  <tr key={org.id} className="border-t border-[#1e3a5f]/60 hover:bg-[#0f1e35]/50">
                    <td className="px-3 py-2 text-[#e8f1ff]">{org.name}</td>
                    <td className="px-3 py-2 font-mono text-[#8b9bb4]">{org.code}</td>
                    <td className="px-3 py-2 text-[#8b9bb4]">{org.org_type_display || org.org_type}</td>
                    <td className="px-3 py-2 text-[#8b9bb4]">{org.parent_name || '-'}</td>
                    <td className="px-3 py-2 text-[#8b9bb4]">{org.region || '-'}</td>
                    <td className="px-3 py-2 text-[#8b9bb4]">
                      {org.contact || '-'}
                      {org.phone ? ` / ${org.phone}` : ''}
                    </td>
                    <td className="px-3 py-2 font-mono text-[#8b9bb4]">{org.user_count ?? 0}</td>
                    <td className="px-3 py-2">
                      <span className={org.is_active ? 'text-[#10b981]' : 'text-[#8b9bb4]'}>
                        {org.is_active ? '启用' : '停用'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => void openEdit(org)}
                        className="text-[#3b82f6] hover:underline"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => askDelete(org)}
                        className="text-[#ef4444] hover:underline"
                      >
                        删除
                      </button>
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
        title="删除组织"
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
          <div className="w-full max-w-lg bg-[#152238] border border-[#1e3a5f] rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[#e8f1ff]">
              {editing ? '编辑组织' : '新增组织'}
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
                  disabled={!!editing}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff] disabled:opacity-60"
                />
              </label>
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>类型</span>
                <select
                  value={form.org_type}
                  onChange={(e) => setForm((f) => ({ ...f, org_type: e.target.value }))}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                >
                  {ORG_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>上级组织</span>
                <select
                  value={form.parent ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      parent: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                >
                  <option value="">无（顶级）</option>
                  {parentOptions
                    .filter((o) => !editing || o.id !== editing.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>区域</span>
                <input
                  value={form.region || ''}
                  onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </label>
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>联系人</span>
                <input
                  value={form.contact || ''}
                  onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </label>
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>电话</span>
                <input
                  value={form.phone || ''}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </label>
              <label className="text-[10px] text-[#8b9bb4] space-y-1">
                <span>排序</span>
                <input
                  type="number"
                  value={form.sort_order ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </label>
              <label className="col-span-2 text-[10px] text-[#8b9bb4] space-y-1">
                <span>地址</span>
                <input
                  value={form.address || ''}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </label>
              <label className="col-span-2 text-[10px] text-[#8b9bb4] space-y-1">
                <span>备注</span>
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
                  checked={form.is_active !== false}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                启用
              </label>
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

export default function OrgsPage() {
  return (
    <AuthGuard>
      <OrgsPageContent />
    </AuthGuard>
  );
}
