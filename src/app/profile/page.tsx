'use client';

import { FormEvent, useEffect, useState, type ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import {
  useAuth,
  getAvatarLetter,
  getDisplayName,
} from '@/contexts/AuthContext';
import {
  changeUserPassword,
  updateUserProfile,
  type UserProfile,
} from '@/lib/api/profile';

type ProfileTab = 'info' | 'password';

function formatDateTime(value?: string | null): string {
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

function ProfilePageContent() {
  const { user, refreshUser, logout } = useAuth();
  const [tab, setTab] = useState<ProfileTab>('info');

  return (
    <div className="h-full flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[#e8f1ff]">个人中心</h1>

      <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-[#1e3a5f] flex items-center justify-center text-xl text-[#e8f1ff]">
          {getAvatarLetter(user)}
        </div>
        <div className="min-w-0">
          <div className="text-sm text-[#e8f1ff] font-medium truncate">
            {getDisplayName(user)}
          </div>
          <div className="text-xs text-[#8b9bb4] mt-1 truncate">
            @{user?.username || '-'}
            {user?.role_ref_name || user?.role_display
              ? ` · ${user.role_ref_name || user.role_display}`
              : ''}
            {user?.organization_name ? ` · ${user.organization_name}` : ''}
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[180px_1fr] gap-4 min-h-0">
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-2 h-fit">
          {(
            [
              { key: 'info', label: '基本信息' },
              { key: 'password', label: '修改密码' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                tab === item.key
                  ? 'bg-[#3b82f6]/15 text-[#3b82f6]'
                  : 'text-[#8b9bb4] hover:text-[#e8f1ff] hover:bg-[#0f1e35]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-6 overflow-auto">
          {tab === 'info' && user && (
            <ProfileInfoForm user={user} onSaved={() => void refreshUser()} />
          )}
          {tab === 'info' && !user && (
            <p className="text-xs text-[#8b9bb4]">正在加载个人信息…</p>
          )}
          {tab === 'password' && (
            <ChangePasswordForm
              onSuccess={() => {
                // 改密后强制重新登录，避免旧会话残留
                logout();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-[#8b9bb4]">{label}</label>
      {children}
      {hint ? <p className="text-[10px] text-[#8b9bb4]">{hint}</p> : null}
    </div>
  );
}

const inputClass =
  'w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] disabled:opacity-60';

function ProfileInfoForm({
  user,
  onSaved,
}: {
  user: UserProfile;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(user.first_name || '');
  const [lastName, setLastName] = useState(user.last_name || '');
  const [email, setEmail] = useState(user.email || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [department, setDepartment] = useState(user.department || '');
  const [region, setRegion] = useState(user.region || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setFirstName(user.first_name || '');
    setLastName(user.last_name || '');
    setEmail(user.email || '');
    setPhone(user.phone || '');
    setDepartment(user.department || '');
    setRegion(user.region || '');
  }, [user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await updateUserProfile({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        department,
        region,
      });
      setMessage('保存成功');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 max-w-xl">
      <h3 className="text-sm font-medium text-[#e8f1ff] pb-2 border-b border-[#1e3a5f]">
        基本信息
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <Field label="用户名" hint="不可修改">
          <input className={inputClass} value={user.username} disabled />
        </Field>
        <Field label="角色" hint="由管理员分配">
          <input
            className={inputClass}
            value={user.role_ref_name || user.role_display || user.role || '-'}
            disabled
          />
        </Field>
        <Field label="姓">
          <input
            className={inputClass}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={saving}
          />
        </Field>
        <Field label="名">
          <input
            className={inputClass}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={saving}
          />
        </Field>
        <Field label="邮箱">
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={saving}
          />
        </Field>
        <Field label="手机号">
          <input
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={saving}
          />
        </Field>
        <Field label="部门">
          <input
            className={inputClass}
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            disabled={saving}
          />
        </Field>
        <Field label="所属林区">
          <input
            className={inputClass}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={saving}
          />
        </Field>
        <Field label="所属组织">
          <input className={inputClass} value={user.organization_name || '-'} disabled />
        </Field>
        <Field label="上次登录">
          <input className={inputClass} value={formatDateTime(user.last_login)} disabled />
        </Field>
      </div>

      {error ? (
        <div className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded px-3 py-2">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="text-xs text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/30 rounded px-3 py-2">
          {message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
      >
        {saving ? '保存中…' : '保存修改'}
      </button>
    </form>
  );
}

function ChangePasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (newPassword.length < 8) {
      setError('新密码至少 8 位');
      return;
    }

    setSaving(true);
    try {
      await changeUserPassword({
        old_password: oldPassword,
        new_password: newPassword,
        new_password_confirm: confirmPassword,
      });
      setMessage('密码修改成功，即将跳转登录页…');
      setTimeout(() => onSuccess(), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 max-w-md">
      <h3 className="text-sm font-medium text-[#e8f1ff] pb-2 border-b border-[#1e3a5f]">
        修改密码
      </h3>
      <p className="text-[11px] text-[#8b9bb4] -mt-2">
        修改成功后将自动退出并跳转登录页，请使用新密码重新登录。
      </p>

      <Field label="当前密码">
        <input
          type="password"
          className={inputClass}
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          disabled={saving}
          autoComplete="current-password"
          required
        />
      </Field>
      <Field label="新密码" hint="至少 8 位，建议包含字母与数字">
        <input
          type="password"
          className={inputClass}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={saving}
          autoComplete="new-password"
          required
        />
      </Field>
      <Field label="确认新密码">
        <input
          type="password"
          className={inputClass}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={saving}
          autoComplete="new-password"
          required
        />
      </Field>

      {error ? (
        <div className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded px-3 py-2">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="text-xs text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/30 rounded px-3 py-2">
          {message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
      >
        {saving ? '提交中…' : '确认修改'}
      </button>
    </form>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfilePageContent />
    </AuthGuard>
  );
}
