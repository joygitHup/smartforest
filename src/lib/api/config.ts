/**
 * API 源地址。
 * 默认走 Next.js 同源 `/api` 代理（见 next.config rewrites），避免跨域 Failed to fetch。
 * 需要直连 Django 时设置：NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
 */
export const API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_URL || ''
)
  .replace(/\/$/, '')
  .replace(/\/api$/, '');

/** WebSocket / 直连后端用的源（代理不可转发 WS） */
export const BACKEND_ORIGIN = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://127.0.0.1:8000'
)
  .replace(/\/$/, '')
  .replace(/\/api$/, '');

/** 拼接完整 API URL；Django 默认要求尾部斜杠 */
export function apiUrl(path: string): string {
  let normalized = path.startsWith('/') ? path : `/${path}`;
  const qIndex = normalized.indexOf('?');
  const pathname = qIndex >= 0 ? normalized.slice(0, qIndex) : normalized;
  const query = qIndex >= 0 ? normalized.slice(qIndex) : '';
  const withSlash = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return `${API_ORIGIN}${withSlash}${query}`;
}
