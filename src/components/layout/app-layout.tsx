'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/sidebar';
import Header from '@/components/layout/header';
import { ForceChangePasswordModal } from '@/components/force-change-password-modal';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // 登录页和 SSO 回调页不走应用壳（无 Sidebar/Header/改密弹窗）
  const isShellLessRoute =
    pathname === '/login' || pathname.startsWith('/sso/');

  if (isShellLessRoute) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a1628]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 min-h-0 overflow-auto p-4 flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col">{children}</div>
        </main>
      </div>
      <ForceChangePasswordModal />
    </div>
  );
}
