// src/app/login/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // 检查是否已登录
    if (authApi.isAuthenticated()) {
      router.replace('/devices');
    }
    setIsChecking(false);
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await authApi.login(username, password);
      authApi.setToken(data.access);
      authApi.setRefreshToken(data.refresh);

      if (data.user) {
        authApi.setUser(data.user);
      }

      toast.success('登录成功！欢迎回来');
      router.replace('/devices');
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.response?.status === 401) {
        setError('用户名或密码错误，请重新输入');
      } else if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else if (err.code === 'ERR_NETWORK') {
        setError('无法连接到服务器，请检查网络连接');
      } else {
        setError('登录失败，请稍后重试');
      }
      toast.error('登录失败');
    } finally {
      setLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a1628]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3b82f6] mx-auto"></div>
          <p className="text-[#8b9bb4] text-sm mt-4">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a1628] px-4">
      <div className="bg-[#152238] p-8 rounded-xl border border-[#1e3a5f] w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🌲</div>
          <h1 className="text-2xl font-semibold text-[#e8f1ff]">林智监控平台</h1>
          <p className="text-sm text-[#8b9bb4] mt-2">智能森林防火指挥平台</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-[#ef4444]/10 border border-[#ef4444] text-[#ef4444] text-sm rounded-lg p-3 flex items-start gap-2">
              <span className="mt-0.5">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs text-[#8b9bb4] mb-1.5 font-medium">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              className="w-full bg-[#0a1628] border border-[#1e3a5f] rounded-lg px-4 py-3 text-sm text-[#e8f1ff] placeholder-[#4a5f7a] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-all"
              required
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-[#8b9bb4] mb-1.5 font-medium">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="w-full bg-[#0a1628] border border-[#1e3a5f] rounded-lg px-4 py-3 text-sm text-[#e8f1ff] placeholder-[#4a5f7a] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-all"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#3b82f6] text-white rounded-lg py-3 text-sm font-medium hover:bg-[#2563eb] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                登录中...
              </span>
            ) : (
              '登 录'
            )}
          </button>

          <div className="text-center text-xs text-[#4a5f7a] pt-2 border-t border-[#1e3a5f] mt-4">
            💡 默认账号: <span className="text-[#8b9bb4]">admin</span> / 密码: <span className="text-[#8b9bb4]">admin123</span>
          </div>
        </form>
      </div>
    </div>
  );
}