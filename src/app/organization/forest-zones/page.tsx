'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import ConfirmDeleteDialog from '@/components/ui/confirm-delete-dialog';
import Pagination, { usePagination } from '@/components/ui/pagination';
import {
  createForestZone,
  deleteForestZone,
  getForestZones,
  getOrganizations,
  updateForestZone,
  type CreateForestZoneData,
  type ForestZone,
  type Organization,
} from '@/lib/api/organization';

const emptyForm: CreateForestZoneData = {
  name: '',
  code: '',
  organization: null,
  region: '',
  regions: [],
  manager: '',
  contact: '',
  description: '',
  sort_order: 0,
  is_active: true,
};

function ForestZonesPageContent() {
  const [items, setItems] = useState<ForestZone[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ForestZone | null>(null);
  const [form, setForm] = useState<CreateForestZoneData>(emptyForm);
  const [regionDraft, setRegionDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [orgOptions, setOrgOptions] = useState<Organization[]>([]);
  const [deleting, setDeleting] = useState<ForestZone | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const { current, pageSize, onPageChange, onPageSizeChange } = usePagination(10);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getForestZones({
        page: current,
        page_size: pageSize,
        search: search || undefined,
        organization: orgFilter ? Number(orgFilter) : undefined,
        is_active: activeFilter === '' ? undefined : activeFilter === '1',
      });
      setItems(res.results);
      setTotal(res.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取林区失败');
    } finally {
      setLoading(false);
    }
  }, [current, pageSize, search, activeFilter, orgFilter]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    void getOrganizations({ page: 1, page_size: 200 })
      .then((res) => setOrgOptions(res.results))
      .catch(() => setOrgOptions([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => onPageChange(1), 400);
    return () => clearTimeout(t);
  }, [search, activeFilter, orgFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOrgs = async () => {
    const res = await getOrganizations({ page: 1, page_size: 200, is_active: true });
    setOrgOptions(res.results);
  };

  const openCreate = async () => {
    setEditing(null);
    setForm(emptyForm);
    setRegionDraft('');
    setFormError('');
    setDialogOpen(true);
    try {
      await loadOrgs();
    } catch {
      /* ignore */
    }
  };

  const openEdit = async (zone: ForestZone) => {
    const regions =
      zone.regions && zone.regions.length > 0
        ? zone.regions
        : zone.region
          ? [zone.region]
          : [];
    setEditing(zone);
    setForm({
      name: zone.name,
      code: zone.code,
      organization: zone.organization,
      region: regions[0] || '',
      regions,
      manager: zone.manager || '',
      contact: zone.contact || '',
      description: zone.description || '',
      sort_order: zone.sort_order ?? 0,
      is_active: zone.is_active,
    });
    setRegionDraft('');
    setFormError('');
    setDialogOpen(true);
    try {
      await loadOrgs();
    } catch {
      /* ignore */
    }
  };

  const addRegionTag = () => {
    const value = regionDraft.trim();
    if (!value) return;
    const current = form.regions || [];
    if (current.includes(value)) {
      setRegionDraft('');
      return;
    }
    const next = [...current, value];
    setForm({ ...form, regions: next, region: next[0] || '' });
    setRegionDraft('');
  };

  const removeRegionTag = (name: string) => {
    const next = (form.regions || []).filter((r) => r !== name);
    setForm({ ...form, regions: next, region: next[0] || '' });
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.name.trim() || !form.code.trim()) {
      setFormError('名称与编码必填');
      return;
    }
    setSaving(true);
    try {
      const regions = form.regions || [];
      const payload = {
        ...form,
        name: form.name.trim(),
        code: form.code.trim(),
        organization: form.organization || undefined,
        regions,
        region: regions[0] || '',
      };
      if (editing) {
        await updateForestZone(editing.id, payload);
      } else {
        await createForestZone(payload);
      }
      setDialogOpen(false);
      await fetchList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await deleteForestZone(deleting.id);
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
          <h1 className="text-lg font-semibold text-[#e8f1ff]">林区管理</h1>
          <p className="text-[11px] text-[#8b9bb4] mt-1">
            林区按所属组织隔离；指挥中心/上级可查看并汇总全部下属单位林区
          </p>
        </div>
        <button
          type="button"
          onClick={() => void openCreate()}
          className="px-3 py-1.5 rounded text-xs bg-[#3b82f6] text-white hover:bg-[#2563eb]"
        >
          新建林区
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索名称/编码/责任人"
          className="bg-[#152238] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] w-56"
        />
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff] min-w-[160px]"
        >
          <option value="">全部组织（含下属）</option>
          {orgOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="bg-[#152238] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
        >
          <option value="">全部状态</option>
          <option value="1">仅启用</option>
          <option value="0">仅停用</option>
        </select>
      </div>

      {error && (
        <div className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex-1 bg-[#152238] border border-[#1e3a5f] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#0f1e35] border-b border-[#1e3a5f]">
            <tr>
              <th className="text-left px-4 py-3 text-xs text-[#8b9bb4]">编码</th>
              <th className="text-left px-4 py-3 text-xs text-[#8b9bb4]">名称</th>
              <th className="text-left px-4 py-3 text-xs text-[#8b9bb4]">所属组织</th>
              <th className="text-left px-4 py-3 text-xs text-[#8b9bb4]">片区</th>
              <th className="text-left px-4 py-3 text-xs text-[#8b9bb4]">责任人</th>
              <th className="text-left px-4 py-3 text-xs text-[#8b9bb4]">设备数</th>
              <th className="text-left px-4 py-3 text-xs text-[#8b9bb4]">状态</th>
              <th className="text-right px-4 py-3 text-xs text-[#8b9bb4]">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-xs text-[#8b9bb4]">
                  加载中…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-xs text-[#8b9bb4]">
                  暂无林区，请先新建（空组织即为空系统）
                </td>
              </tr>
            ) : (
              items.map((z) => (
                <tr key={z.id} className="border-b border-[#1e3a5f]/60 hover:bg-[#0f1e35]/50">
                  <td className="px-4 py-3 text-xs font-mono text-[#3b82f6]">{z.code}</td>
                  <td className="px-4 py-3 text-xs text-[#e8f1ff]">{z.name}</td>
                  <td className="px-4 py-3 text-xs text-[#8b9bb4]">{z.organization_name || '-'}</td>
                  <td className="px-4 py-3 text-xs text-[#8b9bb4]">
                    {(z.regions && z.regions.length > 0
                      ? z.regions
                      : z.region
                        ? [z.region]
                        : []
                    ).join('、') || '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#8b9bb4]">{z.manager || '-'}</td>
                  <td className="px-4 py-3 text-xs font-mono text-[#e8f1ff]">{z.device_count ?? 0}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className={z.is_active ? 'text-[#10b981]' : 'text-[#8b9bb4]'}>
                      {z.is_active ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs space-x-2">
                    <button
                      type="button"
                      onClick={() => void openEdit(z)}
                      className="text-[#3b82f6] hover:underline"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleting(z);
                        setDeleteError('');
                      }}
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
        total={total}
        pageSize={pageSize}
        onChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg bg-[#152238] border border-[#1e3a5f] rounded-lg p-5">
            <h2 className="text-sm font-semibold text-[#e8f1ff] mb-4">
              {editing ? '编辑林区' : '新建林区'}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#8b9bb4] mb-1">名称 *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#8b9bb4] mb-1">编码 *</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff] font-mono"
                  placeholder="LZ-A-01"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-[#8b9bb4] mb-1">所属组织</label>
                <select
                  value={form.organization ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      organization: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                >
                  <option value="">默认当前用户组织</option>
                  {orgOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-[#8b9bb4] mb-1">
                  片区列表（一个林区可多个）
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                  {(form.regions || []).map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1e3a5f] text-[11px] text-[#e8f1ff]"
                    >
                      {r}
                      <button
                        type="button"
                        onClick={() => removeRegionTag(r)}
                        className="text-[#8b9bb4] hover:text-[#ef4444]"
                        aria-label={`移除 ${r}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {(form.regions || []).length === 0 && (
                    <span className="text-[11px] text-[#5a6a82]">尚未添加片区</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={regionDraft}
                    onChange={(e) => setRegionDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addRegionTag();
                      }
                    }}
                    placeholder="输入片区名后回车或点击添加"
                    className="flex-1 bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                  />
                  <button
                    type="button"
                    onClick={addRegionTag}
                    className="px-3 py-1.5 rounded text-xs border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6]"
                  >
                    添加
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-[#8b9bb4] mb-1">责任人</label>
                <input
                  value={form.manager || ''}
                  onChange={(e) => setForm({ ...form, manager: e.target.value })}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#8b9bb4] mb-1">联系方式</label>
                <input
                  value={form.contact || ''}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#8b9bb4] mb-1">排序</label>
                <input
                  type="number"
                  value={form.sort_order ?? 0}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-[#8b9bb4] mb-1">备注</label>
                <textarea
                  value={form.description || ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1.5 text-xs text-[#e8f1ff]"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  id="fz-active"
                  type="checkbox"
                  checked={form.is_active !== false}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                <label htmlFor="fz-active" className="text-xs text-[#e8f1ff]">
                  启用（停用后不可再挂新设备）
                </label>
              </div>
            </div>
            {formError && <p className="text-xs text-[#ef4444] mt-3">{formError}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="px-3 py-1.5 rounded text-xs border border-[#1e3a5f] text-[#8b9bb4]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="px-3 py-1.5 rounded text-xs bg-[#3b82f6] text-white disabled:opacity-50"
              >
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!deleting}
        title="删除林区"
        targetName={deleting?.name || ''}
        loading={deleteLoading}
        error={deleteError}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

export default function ForestZonesPage() {
  return (
    <AuthGuard>
      <ForestZonesPageContent />
    </AuthGuard>
  );
}
