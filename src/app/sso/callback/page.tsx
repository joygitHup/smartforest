'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api/config';

interface SSOExchangeResponse {
  access: string;
  refresh: string;
  user: {
    id: number;
    username: string;
    role: string;
    email?: string;
  };
}

/**
 * SSO 回调页面 — 第三方平台携带 token 跳转到此页。
 *
 * 用法（第三方平台）:
 *   方式一 (query):   https://smartforest/sso/callback?token=<third_party_token>
 *   方式二 (fragment): https://smartforest/sso/callback#token=<third_party_token>
 *
 * 流程:
 *   1. 从 URL 取 token
 *   2. POST /api/sso/exchange/ (后端调第三方 validate 端点校验)
 *   3. valid=true  → setTokens + 缓存 user + 跳 /dashboard（URL 中 token 自动清除）
 *   4. valid=false → 跳 /login
 */
export default function SSOCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    void handleSSOCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSSOCallback() {
    try {
      // 1. 从 URL 取 token（query 或 fragment）
      let token = searchParams.get('token');
      if (!token && typeof window !== 'undefined') {
        const hash = window.location.hash.slice(1);
        const params = new URLSearchParams(hash);
        token = params.get('token');
      }

      if (!token) {
        router.replace('/login');
        return;
      }

      // 2. POST /api/sso/exchange/ (后端调第三方 validate 端点校验)
      const resp = await fetch(apiUrl('/api/sso/exchange/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      // 3. valid=false 或校验失败 → 跳登录页（删 URL 中的 token）
      if (!resp.ok) {
        router.replace('/login');
        return;
      }

      const data = (await resp.json()) as SSOExchangeResponse;

      // 4. valid=true → 用 AuthContext.login() 建会话
      //    login() 内部调 setTokens() + setIsAuthenticated(true) + refreshUser()
      //    确保 React state 同步更新，跳 dashboard 后不白屏
      login(data.access, data.refresh);

      // 5. 删 URL 中的 token + 跳 dashboard
      //    router.replace 替换整个 URL，token 从地址栏消失
      router.replace('/dashboard');
    } catch {
      // 网络异常等 → 跳登录页
      router.replace('/login');
    }
  }

  // 加载中（用户看不到，很快就会跳转）
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a1628]">
      <div className="text-center">
        <div className="inline-block w-10 h-10 border-3 border-[#1e3a5f] border-t-[#3b82f6] rounded-full animate-spin mb-4" />
        <p className="text-[#8b9bb4] text-sm">SSO 登录中...</p>
      </div>
    </div>
  );
}
