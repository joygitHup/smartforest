'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getDashboardRegions } from '@/lib/api/dashboard';
import { useAuth } from '@/contexts/AuthContext';
import type { ForestZoneFilterItem } from '@/types/dashboard';

const STORAGE_KEY = 'smartforest_region_filter';
const AREA_STORAGE_KEY = 'smartforest_area_filter';

interface RegionFilterContextType {
  /** 全局主筛选：林区名称（顶部「林区筛选」） */
  region: string;
  setRegion: (region: string) => void;
  /** 指挥中心二级筛选：片区/区域 */
  area: string;
  setArea: (area: string) => void;
  regions: string[];
  forestZones: string[];
  forestZoneItems: ForestZoneFilterItem[];
  regionsByForestZone: Record<string, string[]>;
  /** 当前林区下可选片区；未选林区时返回全部片区 */
  areasForCurrentZone: string[];
  loading: boolean;
  refreshOptions: () => Promise<void>;
}

const RegionFilterContext = createContext<RegionFilterContextType | undefined>(undefined);

function readStored(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeStored(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function RegionFilterProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [region, setRegionState] = useState('');
  const [area, setAreaState] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [forestZones, setForestZones] = useState<string[]>([]);
  const [forestZoneItems, setForestZoneItems] = useState<ForestZoneFilterItem[]>([]);
  const [regionsByForestZone, setRegionsByForestZone] = useState<Record<string, string[]>>(
    {}
  );
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setRegionState(readStored(STORAGE_KEY));
    setAreaState(readStored(AREA_STORAGE_KEY));
    setHydrated(true);
  }, []);

  const setRegion = useCallback((value: string) => {
    setRegionState(value);
    writeStored(STORAGE_KEY, value);
    // 切换林区时清空片区，避免跨林区脏过滤
    setAreaState('');
    writeStored(AREA_STORAGE_KEY, '');
  }, []);

  const setArea = useCallback((value: string) => {
    setAreaState(value);
    writeStored(AREA_STORAGE_KEY, value);
  }, []);

  const refreshOptions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDashboardRegions();
      const nextZones = data.forest_zones || [];
      const nextRegions = data.regions || [];
      const nextItems = data.forest_zone_items || [];
      const nextMap = data.regions_by_forest_zone || {};
      setForestZones(nextZones);
      setRegions(nextRegions);
      setForestZoneItems(nextItems);
      setRegionsByForestZone(nextMap);

      const allowedZones = new Set(nextZones.length > 0 ? nextZones : nextRegions);
      setRegionState((prev) => {
        if (prev && allowedZones.size > 0 && !allowedZones.has(prev)) {
          writeStored(STORAGE_KEY, '');
          return '';
        }
        return prev;
      });
      setAreaState((prev) => {
        if (!prev) return prev;
        const zone = readStored(STORAGE_KEY);
        const allowedAreas = zone && nextMap[zone]?.length ? nextMap[zone] : nextRegions;
        if (allowedAreas.length > 0 && !allowedAreas.includes(prev)) {
          writeStored(AREA_STORAGE_KEY, '');
          return '';
        }
        return prev;
      });
    } catch {
      setRegions([]);
      setForestZones([]);
      setForestZoneItems([]);
      setRegionsByForestZone({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !isAuthenticated) {
      if (!isAuthenticated) {
        setRegions([]);
        setForestZones([]);
        setForestZoneItems([]);
        setRegionsByForestZone({});
      }
      return;
    }
    void refreshOptions();
  }, [
    hydrated,
    isAuthenticated,
    refreshOptions,
    user?.id,
    user?.organization,
    user?.org_scope?.scope_label,
  ]);

  const areasForCurrentZone = useMemo(() => {
    // 未选林区时不提供片区，强制林区→片区联动
    if (!region) return [];
    return regionsByForestZone[region] || [];
  }, [region, regionsByForestZone]);

  const value = useMemo(
    () => ({
      region,
      setRegion,
      area,
      setArea,
      regions,
      forestZones,
      forestZoneItems,
      regionsByForestZone,
      areasForCurrentZone,
      loading,
      refreshOptions,
    }),
    [
      region,
      setRegion,
      area,
      setArea,
      regions,
      forestZones,
      forestZoneItems,
      regionsByForestZone,
      areasForCurrentZone,
      loading,
      refreshOptions,
    ]
  );

  return (
    <RegionFilterContext.Provider value={value}>{children}</RegionFilterContext.Provider>
  );
}

export function useRegionFilter(): RegionFilterContextType {
  const ctx = useContext(RegionFilterContext);
  if (!ctx) {
    throw new Error('useRegionFilter must be used within RegionFilterProvider');
  }
  return ctx;
}
