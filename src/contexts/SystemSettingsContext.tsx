'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getOrganizationSettings,
  getPlatformSettings,
  updateOrganizationSettings,
  updatePlatformSettings,
} from '@/lib/api/system-settings';
import {
  DEFAULT_SYSTEM_SETTINGS,
  applyOrganizationSettingsPayload,
  applyPlatformName,
  loadSystemSettings,
  saveSystemSettings,
  toOrganizationSettingsPatch,
  type DeviceSettingsData,
  type GeneralSettingsData,
  type ManagementSettingsData,
  type NotificationSettingsData,
  type SystemSettingsStore,
} from '@/lib/system-settings';

interface SystemSettingsContextType {
  settings: SystemSettingsStore;
  hydrated: boolean;
  canEditPlatformName: boolean;
  canEditOrgSettings: boolean;
  refreshFromServer: () => Promise<void>;
  updateGeneral: (data: GeneralSettingsData) => Promise<void>;
  updateDevice: (data: DeviceSettingsData) => Promise<void>;
  updateNotification: (data: NotificationSettingsData) => Promise<void>;
  updateManagement: (data: ManagementSettingsData) => Promise<void>;
  resetGeneral: () => GeneralSettingsData;
  resetDevice: () => DeviceSettingsData;
  resetNotification: () => NotificationSettingsData;
  resetManagement: () => ManagementSettingsData;
}

const SystemSettingsContext = createContext<SystemSettingsContextType | undefined>(undefined);

function persist(next: SystemSettingsStore) {
  saveSystemSettings(next);
  return next;
}

export function SystemSettingsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [settings, setSettings] = useState<SystemSettingsStore>(DEFAULT_SYSTEM_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [canEditPlatformName, setCanEditPlatformName] = useState(false);
  const [canEditOrgSettings, setCanEditOrgSettings] = useState(false);

  const refreshFromServer = useCallback(async () => {
    if (!isAuthenticated) {
      const local = loadSystemSettings();
      setSettings(local);
      setCanEditPlatformName(false);
      setCanEditOrgSettings(false);
      setHydrated(true);
      return;
    }
    try {
      const [platform, org] = await Promise.all([
        getPlatformSettings(),
        getOrganizationSettings(),
      ]);
      setCanEditPlatformName(Boolean(platform.can_edit));
      setCanEditOrgSettings(Boolean(org.can_edit));
      setSettings((prev) => {
        const withPlatform = applyPlatformName(prev, platform.platform_name);
        const merged = applyOrganizationSettingsPayload(withPlatform, org);
        return persist(merged);
      });
    } catch {
      // 离线/接口失败时保留本地缓存
      setSettings(loadSystemSettings());
      setCanEditPlatformName(Boolean(user?.org_scope?.unrestricted || user?.is_superuser));
      setCanEditOrgSettings(true);
    } finally {
      setHydrated(true);
    }
  }, [isAuthenticated, user?.org_scope?.unrestricted, user?.is_superuser]);

  useEffect(() => {
    setSettings(loadSystemSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    void refreshFromServer();
  }, [refreshFromServer, user?.id, user?.organization]);

  const saveOrgSlice = useCallback(async (next: SystemSettingsStore) => {
    const saved = await updateOrganizationSettings(toOrganizationSettingsPatch(next));
    const merged = applyOrganizationSettingsPayload(
      applyPlatformName(next, next.general.platformName),
      saved
    );
    setSettings(persist(merged));
    setCanEditOrgSettings(Boolean(saved.can_edit));
  }, []);

  const updateGeneral = useCallback(
    async (data: GeneralSettingsData) => {
      const trimmedName = data.platformName.trim();
      if (!trimmedName) {
        throw new Error('系统平台名称不能为空');
      }

      let platformName = settings.general.platformName;
      if (canEditPlatformName && trimmedName !== settings.general.platformName) {
        const platform = await updatePlatformSettings({ platform_name: trimmedName });
        platformName = platform.platform_name;
        setCanEditPlatformName(Boolean(platform.can_edit));
      } else if (!canEditPlatformName) {
        platformName = settings.general.platformName;
      } else {
        platformName = trimmedName;
      }

      const next: SystemSettingsStore = {
        ...settings,
        general: {
          ...data,
          platformName,
        },
      };
      setSettings(persist(next));

      if (!canEditOrgSettings) {
        throw new Error('无权修改本组织设置');
      }
      await saveOrgSlice(next);
    },
    [canEditOrgSettings, canEditPlatformName, saveOrgSlice, settings]
  );

  const updateDevice = useCallback(
    async (data: DeviceSettingsData) => {
      if (!canEditOrgSettings) {
        throw new Error('无权修改本组织设置');
      }
      const next = { ...settings, device: data };
      setSettings(persist(next));
      await saveOrgSlice(next);
    },
    [canEditOrgSettings, saveOrgSlice, settings]
  );

  const updateNotification = useCallback(
    async (data: NotificationSettingsData) => {
      if (!canEditOrgSettings) {
        throw new Error('无权修改本组织设置');
      }
      const next = { ...settings, notification: data };
      setSettings(persist(next));
      await saveOrgSlice(next);
    },
    [canEditOrgSettings, saveOrgSlice, settings]
  );

  const updateManagement = useCallback(
    async (data: ManagementSettingsData) => {
      if (!canEditOrgSettings) {
        throw new Error('无权修改本组织设置');
      }
      const next = { ...settings, management: data };
      setSettings(persist(next));
      await saveOrgSlice(next);
    },
    [canEditOrgSettings, saveOrgSlice, settings]
  );

  const resetGeneral = useCallback(() => {
    const current = settings.general;
    return { ...current };
  }, [settings.general]);

  const resetDevice = useCallback(() => {
    return { ...settings.device };
  }, [settings.device]);

  const resetNotification = useCallback(() => {
    return { ...settings.notification };
  }, [settings.notification]);

  const resetManagement = useCallback(() => {
    return { ...settings.management };
  }, [settings.management]);

  return (
    <SystemSettingsContext.Provider
      value={{
        settings,
        hydrated,
        canEditPlatformName,
        canEditOrgSettings,
        refreshFromServer,
        updateGeneral,
        updateDevice,
        updateNotification,
        updateManagement,
        resetGeneral,
        resetDevice,
        resetNotification,
        resetManagement,
      }}
    >
      {children}
    </SystemSettingsContext.Provider>
  );
}

export function useSystemSettings() {
  const ctx = useContext(SystemSettingsContext);
  if (!ctx) {
    throw new Error('useSystemSettings must be used within a SystemSettingsProvider');
  }
  return ctx;
}
