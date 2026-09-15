'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 兼容旧入口：/alerts → /alerts/records */
export default function AlertsIndexRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/alerts/records');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-full min-h-[240px]">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-[#8b9bb4]">正在跳转到告警记录…</p>
      </div>
    </div>
  );
}
