'use client';

import { useEffect, useRef } from 'react';
import { getDashboardWsUrl } from '@/lib/api/dashboard';

export type DashboardWsMessage =
  | { type: 'connection_established'; message?: string }
  | { type: 'pong' }
  | { type: 'alert'; data: unknown }
  | { type: 'in_app'; data: unknown }
  | { type: 'device_status'; data: unknown }
  | { type: 'telemetry'; data: unknown }
  | { type: 'fire_tracing'; data: unknown }
  | { type: string; data?: unknown };

/**
 * 指挥中心 WebSocket：告警 / 设备状态实时推送。
 * onMessage 触发后建议短暂防抖再刷新 overview。
 */
export function useDashboardSocket(
  enabled: boolean,
  onMessage: (msg: DashboardWsMessage) => void
): void {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!enabled) return;

    const url = getDashboardWsUrl();
    if (!url) return;

    let ws: WebSocket | null = null;
    let closed = false;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryMs = 3000;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(url);
      } catch {
        retryTimer = setTimeout(connect, retryMs);
        return;
      }

      ws.onopen = () => {
        retryMs = 3000;
        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as DashboardWsMessage;
          handlerRef.current(data);
        } catch {
          // ignore malformed
        }
      };

      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        if (!closed) {
          retryTimer = setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 1.5, 30000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (pingTimer) clearInterval(pingTimer);
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [enabled]);
}
