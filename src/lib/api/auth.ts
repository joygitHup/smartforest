// src/lib/api/auth.ts
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

// ✅ 添加客户端检测
const isClient = typeof window !== 'undefined';

export const authApi = {
  login: async (username: string, password: string) => {
    const response = await axios.post(`${API_BASE}/token/`, {
      username,
      password,
    });
    return response.data;
  },

  logout: () => {
    if (!isClient) return;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  },

  refreshToken: async (refresh: string) => {
    const response = await axios.post(`${API_BASE}/token/refresh/`, {
      refresh,
    });
    return response.data;
  },

  verifyToken: async (token: string) => {
    try {
      const response = await axios.post(`${API_BASE}/token/verify/`, {
        token,
      });
      return response.data;
    } catch {
      return null;
    }
  },

  getToken: () => {
    if (!isClient) return null;
    return localStorage.getItem('access_token');
  },

  getRefreshToken: () => {
    if (!isClient) return null;
    return localStorage.getItem('refresh_token');
  },

  setToken: (token: string) => {
    if (!isClient) return;
    localStorage.setItem('access_token', token);
  },

  setRefreshToken: (token: string) => {
    if (!isClient) return;
    localStorage.setItem('refresh_token', token);
  },

  // ✅ 检查是否已登录（安全版本）
  isAuthenticated: () => {
    if (!isClient) return false;
    const token = localStorage.getItem('access_token');
    if (!token) return false;
    // 验证 token 是否过期
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const exp = payload.exp * 1000;
      return Date.now() < exp;
    } catch {
      return false;
    }
  },

  getUser: () => {
    if (!isClient) return null;
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  setUser: (user: any) => {
    if (!isClient) return;
    localStorage.setItem('user', JSON.stringify(user));
  },
};