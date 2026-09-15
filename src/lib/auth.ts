import {
  obtainTokenPair,
  refreshAccessToken,
  verifyAccessToken,
  type TokenPair,
} from '@/lib/api/auth';

export type { TokenPair as TokenResponse };

export interface UserInfo {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  role_display?: string;
}

/** access: 2h，与后端 SIMPLE_JWT.ACCESS_TOKEN_LIFETIME 对齐 */
const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 2;
/** refresh: 7d，与后端 SIMPLE_JWT.REFRESH_TOKEN_LIFETIME 对齐 */
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * 登录获取 token（api/token/）
 */
export async function login(username: string, password: string): Promise<TokenPair> {
  return obtainTokenPair(username, password);
}

/**
 * 刷新 token（api/token/refresh/）
 * 后端开启 ROTATE_REFRESH_TOKENS 时可能同时返回新的 refresh
 */
export async function refreshToken(
  refresh: string
): Promise<{ access: string; refresh?: string }> {
  return refreshAccessToken(refresh);
}

/**
 * 验证 token（api/token/verify/）
 */
export async function verifyToken(token: string): Promise<boolean> {
  return verifyAccessToken(token);
}

function getCookie(name: string): string | null {
  if (typeof window === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

/**
 * 存储 token（localStorage + cookies，cookies 供 middleware 使用）
 */
export function setTokens(access: string, refresh: string): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);

  document.cookie = `access_token=${access}; path=/; max-age=${ACCESS_COOKIE_MAX_AGE}; SameSite=Lax`;
  document.cookie = `refresh_token=${refresh}; path=/; max-age=${REFRESH_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * 仅更新 access；若传入新 refresh（旋转刷新）则一并更新
 */
export function updateAccessToken(access: string, refresh?: string): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem('access_token', access);
  document.cookie = `access_token=${access}; path=/; max-age=${ACCESS_COOKIE_MAX_AGE}; SameSite=Lax`;

  if (refresh) {
    localStorage.setItem('refresh_token', refresh);
    document.cookie = `refresh_token=${refresh}; path=/; max-age=${REFRESH_COOKIE_MAX_AGE}; SameSite=Lax`;
  }
}

export function getTokens(): { access: string | null; refresh: string | null } {
  if (typeof window === 'undefined') {
    return { access: null, refresh: null };
  }
  return {
    access: localStorage.getItem('access_token') || getCookie('access_token'),
    refresh: localStorage.getItem('refresh_token') || getCookie('refresh_token'),
  };
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');

  document.cookie = 'access_token=; path=/; max-age=0';
  document.cookie = 'refresh_token=; path=/; max-age=0';
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token') || getCookie('access_token');
}

function isTokenExpired(token: string): boolean {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return true;
    const payload = JSON.parse(atob(payloadPart)) as { exp?: number };
    if (!payload.exp) return true;
    // 提前 30s 视为过期，避免边界请求失败
    return Date.now() >= payload.exp * 1000 - 30_000;
  } catch {
    return true;
  }
}

/**
 * 本地检查是否已登录（access 存在且未过期；过期时若仍有 refresh 也视为可会话恢复）
 */
export function isAuthenticated(): boolean {
  const { access, refresh } = getTokens();
  if (access && !isTokenExpired(access)) return true;
  if (refresh && !isTokenExpired(refresh)) return true;
  return false;
}

export function logout(): void {
  clearTokens();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

/**
 * 带认证的 fetch：401 时自动调用 /api/token/refresh/ 并重试
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let { access, refresh } = getTokens();

  if (!access && refresh && !isTokenExpired(refresh)) {
    try {
      const refreshed = await refreshAccessToken(refresh);
      updateAccessToken(refreshed.access, refreshed.refresh);
      access = refreshed.access;
      refresh = refreshed.refresh ?? refresh;
    } catch {
      logout();
      throw new Error('登录已过期，请重新登录');
    }
  }

  if (!access) {
    throw new Error('未登录');
  }

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
    'Content-Type': 'application/json',
    Authorization: `Bearer ${access}`,
  };

  let response = await fetch(url, { ...options, headers });

  if (response.status === 401 && refresh) {
    try {
      const refreshed = await refreshAccessToken(refresh);
      updateAccessToken(refreshed.access, refreshed.refresh);
      headers.Authorization = `Bearer ${refreshed.access}`;
      response = await fetch(url, { ...options, headers });
    } catch {
      logout();
      throw new Error('登录已过期，请重新登录');
    }
  }

  return response;
}
