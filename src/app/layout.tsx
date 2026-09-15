import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import AppLayout from '@/components/layout/app-layout';
import { AuthProvider } from '@/contexts/AuthContext';
import { RegionFilterProvider } from '@/contexts/RegionFilterContext';
import { SystemSettingsProvider } from '@/contexts/SystemSettingsContext';
import './globals.css';

export const metadata: Metadata = {
  title: '林智 - 森林智能监控平台',
  description: '基于阿里云IoT与AI视觉大模型的森林智能监控平台，实现火情预警、设备管理、环境监控等功能',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN" className="dark">
      <body className="antialiased">
        {isDev && <Inspector />}
        <AuthProvider>
          <SystemSettingsProvider>
            <RegionFilterProvider>
              <AppLayout>
                {children}
              </AppLayout>
            </RegionFilterProvider>
          </SystemSettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
