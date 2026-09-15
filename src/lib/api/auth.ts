import { apiUrl } from './config';

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface RefreshTokenResponse {
  access: string;
  refresh?: string;
}

function parseErrorDetail(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.detail === 'string') return record.detail;
  if (Array.isArray(record.non_field_errors) && typeof record.non_field_errors[0] === 'string') {
    return record.non_field_errors[0];
  }
  // SimpleJWT 字段级错误：{ username: ["..."], password: ["..."] }
  for (const key of ['username', 'password']) {
    const val = record[key];
    if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  }
  return fallback;
}

/** POST /api/token/ — SimpleJWT TokenObtainPairView */
export async function obtainTokenPair(
  username: string,
  password: string
): Promise<TokenPair> {
  let response: Response;
  try {
    response = await fetch(apiUrl('/api/token/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error('无法连接后端服务，请确认 Django 已启动（默认端口见 start-all / BACKEND_URL）');
  }

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(parseErrorDetail(data, '用户名或密码错误'));
    }
    if (response.status >= 500) {
      throw new Error('后端服务异常，请稍后重试');
    }
    throw new Error(parseErrorDetail(data, '登录失败，请检查用户名和密码'));
  }

  const tokens = data as Partial<TokenPair>;
  if (!tokens.access || !tokens.refresh) {
    throw new Error('登录响应缺少 access 或 refresh token');
  }

  return { access: tokens.access, refresh: tokens.refresh };
}

/** POST /api/token/refresh/ — SimpleJWT TokenRefreshView */
export async function refreshAccessToken(refresh: string): Promise<RefreshTokenResponse> {
  const response = await fetch(apiUrl('/api/token/refresh/'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(parseErrorDetail(data, 'Token 刷新失败'));
  }

  const result = data as Partial<RefreshTokenResponse>;
  if (!result.access) {
    throw new Error('刷新响应缺少 access token');
  }

  return {
    access: result.access,
    refresh: result.refresh,
  };
}

/** POST /api/token/verify/ — SimpleJWT TokenVerifyView */
export async function verifyAccessToken(token: string): Promise<boolean> {
  const response = await fetch(apiUrl('/api/token/verify/'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  return response.ok;
}

export const authApi = {
  login: obtainTokenPair,
  refreshToken: refreshAccessToken,
  verifyToken: verifyAccessToken,
};
