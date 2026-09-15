'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRegionFilter } from '@/contexts/RegionFilterContext';
import {
  useAuth,
  getAvatarLetter,
  getDisplayName,
} from '@/contexts/AuthContext';
import { useSystemSettings } from '@/contexts/SystemSettingsContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import NotificationBell from '@/components/layout/notification-bell';

export default function Header() {
  const [time, setTime] = useState('');
  const {
    region,
    setRegion,
    area,
    setArea,
    forestZones,
    forestZoneItems,
    regions,
    areasForCurrentZone,
    loading,
  } = useRegionFilter();

  const zoneOptions =
    forestZoneItems.length > 0
      ? forestZoneItems.map((z) => ({
          value: z.name,
          label:
            z.organization_name && z.organization_name !== z.name
              ? `${z.organization_name} · ${z.name}`
              : z.name,
        }))
      : (forestZones.length > 0 ? forestZones : regions).map((name) => ({
          value: name,
          label: name,
        }));

  const { user, logout } = useAuth();
  const { settings } = useSystemSettings();

  const displayName = getDisplayName(user);
  const avatarLetter = getAvatarLetter(user);
  const roleLabel = user?.role_ref_name || user?.role_display || user?.role || '';
  const platformName = settings.general.platformName || '森林智能监控平台';
  const orgLabel =
    user?.org_scope?.scope_label ||
    user?.organization_name ||
    null;
  const tenantTitle = orgLabel
    ? `${orgLabel} · ${platformName}`
    : platformName;

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="flex items-center justify-between h-14 px-6 bg-[#0c1a2e] border-b border-[#1e3a5f]">
      <div className="flex items-center gap-4">
        <h2 className="text-sm font-medium text-[#e8f1ff]">{tenantTitle}</h2>
        <div className="flex items-center gap-2 text-xs text-[#8b9bb4]">
          <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
          <span>{orgLabel ? `${orgLabel}数据视野` : '系统运行正常'}</span>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#8b9bb4] whitespace-nowrap">林区</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={loading && zoneOptions.length === 0}
            className="bg-[#152238] border border-[#1e3a5f] rounded px-2 py-1 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] min-w-[140px] disabled:opacity-60"
          >
            <option value="">全部林区</option>
            {zoneOptions.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-[#8b9bb4] whitespace-nowrap">区域</span>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            disabled={!region}
            className="bg-[#152238] border border-[#1e3a5f] rounded px-2 py-1 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] min-w-[110px] disabled:opacity-50"
            title={!region ? '请先选择林区' : undefined}
          >
            <option value="">
              {!region ? '先选林区' : '全部片区'}
            </option>
            {areasForCurrentZone.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="text-xs text-[#8b9bb4] font-mono">{time}</div>

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[#152238] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#3b82f6]"
            >
              <div className="w-7 h-7 rounded-full bg-[#1e3a5f] flex items-center justify-center text-xs text-[#e8f1ff]">
                {avatarLetter}
              </div>
              <div className="flex flex-col items-start min-w-0">
                <span className="text-xs text-[#e8f1ff] truncate max-w-[100px]">{displayName}</span>
                {roleLabel ? (
                  <span className="text-[10px] text-[#8b9bb4] truncate max-w-[100px]">{roleLabel}</span>
                ) : null}
              </div>
              <span className="text-[10px] text-[#8b9bb4]">▾</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-[180px] bg-[#152238] border-[#1e3a5f] text-[#e8f1ff]"
          >
            <DropdownMenuLabel className="px-2 py-1.5">
              <div className="text-xs text-[#e8f1ff] font-medium truncate">{displayName}</div>
              <div className="text-[10px] text-[#8b9bb4] font-normal truncate">
                @{user?.username || '-'}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#1e3a5f]" />
            <DropdownMenuItem
              asChild
              className="text-xs cursor-pointer focus:bg-[#0f1e35] focus:text-[#e8f1ff]"
            >
              <Link href="/profile">个人中心</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[#1e3a5f]" />
            <DropdownMenuItem
              variant="destructive"
              className="text-xs cursor-pointer text-[#ef4444] focus:bg-[#ef4444]/10 focus:text-[#ef4444]"
              onSelect={() => logout()}
            >
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
