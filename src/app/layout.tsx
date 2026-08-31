// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import Sidebar from '@/components/layout/sidebar';
import Header from '@/components/layout/header';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: '林智 - 森林智能监控平台',
  description: '基于阿里云IoT与AI视觉大模型的森林智能监控平台，实现火情预警、设备管理、环境监控等功能',
};

// ✅ 确保这是一个有效的 React 组件
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN" className="dark">
      <body className="antialiased">
        <AuthProvider>
          {isDev && <Inspector />}
          <div className="flex h-screen overflow-hidden bg-[#0a1628]">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <Header />
              <main className="flex-1 overflow-auto p-4">
                {children}
              </main>
            </div>
          </div>
          <Toaster 
            position="top-right"
            toastOptions={{
              style: {
                background: '#152238',
                color: '#e8f1ff',
                border: '1px solid #1e3a5f',
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}