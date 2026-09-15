'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  getTokens,
  isAuthenticated,
  refreshToken,
  updateAccessToken,
  clearTokens,
} from '@/lib/auth';

interface AuthGuardProps {
  children: ReactNode;
}

function isJwtExpired(token: string): boolean {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return true;
    const payload = JSON.parse(atob(payloadPart)) as { exp?: number };
    if (!payload.exp) return true;
    return Date.now() >= payload.exp * 1000 - 30_000;
  } catch {
    return true;
  }
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function ensureAuth() {
      if (!isAuthenticated()) {
        router.replace('/login');
        return;
      }

      const { access, refresh } = getTokens();

      // access 仍有效
      if (access && !isJwtExpired(access)) {
        if (!cancelled) setAuthorized(true);
        return;
      }

      // access 过期，尝试 refresh
      if (refresh && !isJwtExpired(refresh)) {
        try {
          const tokens = await refreshToken(refresh);
          updateAccessToken(tokens.access, tokens.refresh);
          if (!cancelled) setAuthorized(true);
          return;
        } catch {
          clearTokens();
          router.replace('/login');
          return;
        }
      }

      clearTokens();
      router.replace('/login');
    }

    void ensureAuth();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!authorized) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a1628]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#8b9bb4]">正在加载...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
