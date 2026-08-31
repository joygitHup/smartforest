// src/app/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // 检查是否已登录
    if (authApi.isAuthenticated()) {
      // 如果已登录，跳转到设备管理页
      router.replace('/devices');
    } else {
      // 如果未登录，跳转到登录页
      router.replace('/login');
    }
  }, [router]);

  // 显示加载状态
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a1628]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3b82f6] mx-auto"></div>
        <p className="text-[#8b9bb4] text-sm mt-4">加载中...</p>
      </div>
    </div>
  );
}