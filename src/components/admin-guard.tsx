'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth-guard';
import { useAuth, isSystemAdmin } from '@/contexts/AuthContext';

/**
 * 登录后且须为系统管理员（is_superuser / is_staff / role=admin）。
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AdminOnly>{children}</AdminOnly>
    </AuthGuard>
  );
}

function AdminOnly({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, profileReady, userLoading } = useAuth();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (userLoading || !profileReady) return;
    if (isSystemAdmin(user)) {
      setAllowed(true);
      return;
    }
    router.replace('/dashboard');
  }, [user, profileReady, userLoading, router]);

  if (!profileReady || userLoading || !allowed) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a1628]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#8b9bb4]">
            {!profileReady || userLoading ? '正在校验权限…' : '无权限访问系统运维'}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
