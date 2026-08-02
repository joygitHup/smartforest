'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navItems = [
  { href: '/', label: '指挥中心', icon: '◉' },
  { href: '/devices', label: '设备管理', icon: '⬡' },
  { href: '/alerts', label: '告警中心', icon: '⚠' },
  { href: '/fire-tracing', label: '火情溯源', icon: '🔥' },
  { href: '/reports', label: '报表中心', icon: '▤' },
  { href: '/settings', label: '系统设置', icon: '⚙' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col h-screen bg-[#0c1a2e] border-r border-[#1e3a5f] transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      <div className="flex items-center gap-3 px-4 h-14 border-b border-[#1e3a5f]">
        <div className="w-8 h-8 rounded bg-gradient-to-br from-[#10b981] to-[#3b82f6] flex items-center justify-center text-white text-sm font-bold shrink-0">
          林
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-semibold text-[#e8f1ff] whitespace-nowrap">林智监控平台</h1>
            <p className="text-[10px] text-[#8b9bb4] whitespace-nowrap">Forest Intelligence</p>
          </div>
        )}
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30'
                  : 'text-[#8b9bb4] hover:text-[#e8f1ff] hover:bg-[#152238]'
              }`}
            >
              <span className="text-base shrink-0">{item.icon}</span>
              {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="px-2 pb-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs text-[#8b9bb4] hover:text-[#e8f1ff] hover:bg-[#152238] transition-colors"
        >
          {collapsed ? '▶' : '◀ 收起'}
        </button>
      </div>
    </aside>
  );
}
