'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSystemSettings } from '@/contexts/SystemSettingsContext';
import { useAuth, isSystemAdmin } from '@/contexts/AuthContext';

type NavLeaf = { href: string; label: string; icon: string; adminOnly?: boolean };
type NavGroup = {
  key: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  children: NavLeaf[];
};
type NavItem = NavLeaf | NavGroup;

function isNavGroup(item: NavItem): item is NavGroup {
  return 'children' in item;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: '指挥中心', icon: '◉' },
  {
    key: 'rules',
    label: '规则引擎',
    icon: '⚡',
    children: [{ href: '/rules/alert-rules', label: '告警规则', icon: '⚑' }],
  },
  { href: '/devices', label: '设备管理', icon: '⬡' },
  {
    key: 'alerts',
    label: '告警中心',
    icon: '⚠',
    children: [
      { href: '/alerts/records', label: '告警记录', icon: '☰' },
      { href: '/alerts/work-orders', label: '工单管理', icon: '▤' },
      { href: '/alerts/handling', label: '处理记录', icon: '✓' },
    ],
  },
  { href: '/fire-tracing', label: '火情溯源', icon: '🔥' },
  { href: '/reports', label: '报表中心', icon: '▤' },
  {
    key: 'ops',
    label: '系统运维',
    icon: '🛠',
    adminOnly: true,
    children: [
      { href: '/diagnostics', label: '运维诊断', icon: '⌕', adminOnly: true },
      { href: '/ops/metrics', label: 'Metrics 监控', icon: '▤', adminOnly: true },
    ],
  },
  {
    key: 'organization',
    label: '组织管理',
    icon: '☰',
    children: [
      { href: '/organization/orgs', label: '组织管理', icon: '▦' },
      { href: '/organization/forest-zones', label: '林区管理', icon: '⌂' },
      { href: '/organization/roles', label: '角色管理', icon: '♟' },
      { href: '/organization/users', label: '用户管理', icon: '☺' },
    ],
  },
  { href: '/settings', label: '系统设置', icon: '⚙' },
];

function isPathActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    return pathname === '/' || pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isGroupActive(pathname: string, group: NavGroup): boolean {
  return group.children.some((c) => isPathActive(pathname, c.href));
}

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const { settings } = useSystemSettings();
  const { user } = useAuth();
  const admin = isSystemAdmin(user);
  const platformName = settings.general.platformName || '林智监控平台';

  const visibleNavItems = navItems.filter((item) => {
    if (item.adminOnly && !admin) return false;
    return true;
  });

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const item of visibleNavItems) {
        if (isNavGroup(item) && isGroupActive(pathname, item)) {
          next[item.key] = true;
        }
      }
      return next;
    });
  }, [pathname, admin]);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
            <h1 className="text-sm font-semibold text-[#e8f1ff] whitespace-nowrap truncate max-w-[140px]" title={platformName}>
              {platformName}
            </h1>
            <p className="text-[10px] text-[#8b9bb4] whitespace-nowrap">Forest Intelligence</p>
          </div>
        )}
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => {
          if (isNavGroup(item)) {
            const groupActive = isGroupActive(pathname, item);
            const open = !!openGroups[item.key];
            return (
              <div key={item.key} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (collapsed) {
                      setCollapsed(false);
                      setOpenGroups((prev) => ({ ...prev, [item.key]: true }));
                      return;
                    }
                    toggleGroup(item.key);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    groupActive
                      ? 'bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30'
                      : 'text-[#8b9bb4] hover:text-[#e8f1ff] hover:bg-[#152238]'
                  }`}
                >
                  <span className="text-base shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left whitespace-nowrap">{item.label}</span>
                      <span className="text-[10px] opacity-70">{open ? '▼' : '▶'}</span>
                    </>
                  )}
                </button>
                {!collapsed && open && (
                  <div className="ml-3 pl-2 border-l border-[#1e3a5f] space-y-0.5">
                    {item.children.map((child) => {
                      const active = isPathActive(pathname, child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors ${
                            active
                              ? 'bg-[#3b82f6]/20 text-[#3b82f6]'
                              : 'text-[#8b9bb4] hover:text-[#e8f1ff] hover:bg-[#152238]'
                          }`}
                        >
                          <span className="shrink-0">{child.icon}</span>
                          <span className="whitespace-nowrap">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isActive = isPathActive(pathname, item.href);
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
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs text-[#8b9bb4] hover:text-[#e8f1ff] hover:bg-[#152238] transition-colors"
        >
          {collapsed ? '▶' : '◀ 收起'}
        </button>
      </div>
    </aside>
  );
}
