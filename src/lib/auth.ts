// 认证相关工具函数

export interface TokenResponse {
  access: string;
  refresh: string;
}

export interface UserInfo {
  id: number;
  username: string;
  email: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * 登录获取 token
 */
export async function login(username: string, password: string): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/api/token/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '登录失败，请检查用户名和密码');
  }

  return response.json();
}

/**
 * 刷新 token
 */
export async function refreshToken(refresh: string): Promise<{ access: string }> {
  const response = await fetch(`${API_BASE_URL}/api/token/refresh/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh }),
  });

  if (!response.ok) {
    throw new Error('Token 刷新失败');
  }

  return response.json();
}

/**
 * 验证 token
 */
export async function verifyToken(token: string): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/api/token/verify/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });

  return response.ok;
}

/**
 * 存储 token（同时存储到 localStorage 和 cookies）
 */
export function setTokens(access: string, refresh: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    
    // 同时存储到 cookies，供 middleware 使用
    document.cookie = `access_token=${access}; path=/; max-age=3600; SameSite=Lax`;
    document.cookie = `refresh_token=${refresh}; path=/; max-age=604800; SameSite=Lax`;
  }
}

/**
 * 从 cookies 获取 token
 */
function getCookie(name: string): string | null {
  if (typeof window === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

/**
 * 获取 token（优先从 localStorage，其次从 cookies）
 */
export function getTokens(): { access: string | null; refresh: string | null } {
  if (typeof window !== 'undefined') {
    return {
      access: localStorage.getItem('access_token') || getCookie('access_token'),
      refresh: localStorage.getItem('refresh_token') || getCookie('refresh_token'),
    };
  }
  return { access: null, refresh: null };
}

/**
 * 清除 token（同时清除 localStorage 和 cookies）
 */
export function clearTokens(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    
    // 同时清除 cookies
    document.cookie = 'access_token=; path=/; max-age=0';
    document.cookie = 'refresh_token=; path=/; max-age=0';
  }
}

/**
 * 获取访问 token
 */
export function getAccessToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('access_token');
  }
  return null;
}

/**
 * 检查是否已登录
 */
export function isAuthenticated(): boolean {
  const { access } = getTokens();
  return !!access;
}

/**
 * 登出
 */
export function logout(): void {
  clearTokens();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

/**
 * 带认证的 fetch 请求
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { access, refresh } = getTokens();

  if (!access) {
    throw new Error('未登录');
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${access}`,
    ...options.headers,
  };

  let response = await fetch(url, { ...options, headers });

  // 如果 token 过期，尝试刷新
  if (response.status === 401 && refresh) {
    try {
      const { access: newAccess } = await refreshToken(refresh);
      setTokens(newAccess, refresh);

      // 重试请求
      headers.Authorization = `Bearer ${newAccess}`;
      response = await fetch(url, { ...options, headers });
    } catch {
      // 刷新失败，清除 token 并跳转登录
      logout();
      throw new Error('登录已过期，请重新登录');
    }
  }

  return response;
}
