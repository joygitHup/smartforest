'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  setTokens,
  isAuthenticated as checkAuth,
  logout as authLogout,
} from '@/lib/auth';
import { getUserProfile, type UserProfile } from '@/lib/api/profile';

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserProfile | null;
  userLoading: boolean;
  /** 已从服务端拉取过当前用户资料（用于强制改密等敏感判断，勿信本地缓存） */
  profileReady: boolean;
  login: (access: string, refresh: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_CACHE_KEY = 'user';

function readCachedUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

function writeCachedUser(user: UserProfile | null): void {
  if (typeof window === 'undefined') return;
  if (!user) {
    localStorage.removeItem(USER_CACHE_KEY);
    return;
  }
  localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [profileReady, setProfileReady] = useState(false);

  const refreshUser = useCallback(async () => {
    if (!checkAuth()) {
      setUser(null);
      writeCachedUser(null);
      setProfileReady(false);
      return;
    }
    setUserLoading(true);
    try {
      const profile = await getUserProfile();
      setUser(profile);
      writeCachedUser(profile);
      setProfileReady(true);
    } catch {
      // 保持缓存展示，避免顶部闪空白；不把 profileReady 置真，避免误弹强制改密
    } finally {
      setUserLoading(false);
    }
  }, []);

  useEffect(() => {
    const ok = checkAuth();
    setIsAuthenticated(ok);
    if (ok) {
      // 展示可用缓存，但强制改密等以 profileReady 为准
      setUser(readCachedUser());
      void refreshUser();
    }
  }, [refreshUser]);

  const login = (access: string, refresh: string) => {
    setTokens(access, refresh);
    setIsAuthenticated(true);
    // 切换账号时清掉上一用户缓存，避免 admin 误入他人的强制改密流程
    setUser(null);
    writeCachedUser(null);
    setProfileReady(false);
    void refreshUser();
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
    writeCachedUser(null);
    setProfileReady(false);
    authLogout();
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        userLoading,
        profileReady,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/** 展示名：姓名优先，否则用户名 */
export function getDisplayName(user: UserProfile | null | undefined): string {
  if (!user) return '未登录';
  return user.full_name || user.username || '用户';
}

/** 头像单字：取展示名首字 */
export function getAvatarLetter(user: UserProfile | null | undefined): string {
  const name = getDisplayName(user);
  return name.charAt(0).toUpperCase() || '用';
}

/** 可管理用户（平台管理员或组织管理员）：超管 / staff / role=admin */
export function isSystemAdmin(user: UserProfile | null | undefined): boolean {
  if (!user) return false;
  if (user.is_superuser === true || user.is_staff === true) return true;
  if (user.role === 'admin') return true;
  return false;
}

/** 平台管理员：全平台数据视野 */
export function isPlatformAdmin(user: UserProfile | null | undefined): boolean {
  return !!user?.org_scope?.unrestricted;
}

/** 可重置他人密码：平台管理员或组织管理员 */
export function canResetUserPassword(user: UserProfile | null | undefined): boolean {
  return isSystemAdmin(user);
}
