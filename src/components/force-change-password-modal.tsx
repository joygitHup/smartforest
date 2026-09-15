'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { changeUserPassword } from '@/lib/api/profile';

/**
 * 仅「被管理员重置密码」的目标用户登录后须改密。
 * 依赖服务端 profile（profileReady），避免本地缓存把 admin 误判进流程。
 */
export function ForceChangePasswordModal() {
  const { user, profileReady, logout } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  if (!profileReady || !user?.must_change_password) {
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (newPassword.length < 8) {
      setError('新密码至少 8 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (newPassword === 'Qwe123456') {
      setError('新密码不能与系统默认重置密码相同');
      return;
    }
    setLoading(true);
    try {
      await changeUserPassword({
        old_password: oldPassword || undefined,
        new_password: newPassword,
        new_password_confirm: confirmPassword,
      });
      setMessage('密码修改成功，即将跳转登录页…');
      // 改密后强制重新登录
      window.setTimeout(() => logout(), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md bg-[#152238] border border-[#1e3a5f] rounded-xl shadow-2xl p-6">
        <h2 className="text-lg font-semibold text-[#e8f1ff]">请设置新密码</h2>
        <p className="text-xs text-[#f59e0b] mt-2 leading-relaxed">
          您的密码已被管理员重置，须设置新密码。修改成功后将跳转登录页，请使用新密码重新登录。
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-3">
          <div>
            <label className="block text-[11px] text-[#8b9bb4] mb-1">
              当前临时密码（可选，用于校验）
            </label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#0f1e35] border border-[#1e3a5f] rounded text-[#e8f1ff]"
              placeholder="刚才登录使用的密码"
              disabled={loading}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#8b9bb4] mb-1">新密码</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#0f1e35] border border-[#1e3a5f] rounded text-[#e8f1ff]"
              placeholder="至少 8 位，含字母与数字"
              required
              disabled={loading}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#8b9bb4] mb-1">确认新密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#0f1e35] border border-[#1e3a5f] rounded text-[#e8f1ff]"
              required
              disabled={loading}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 rounded px-3 py-2">
              {error}
            </div>
          )}
          {message && (
            <div className="text-xs text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/30 rounded px-3 py-2">
              {message}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 text-sm bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white rounded"
            >
              {loading ? '提交中…' : '确认修改并重新登录'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => logout()}
              className="px-3 py-2 text-sm border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#ef4444] hover:text-[#ef4444]"
            >
              退出登录
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
