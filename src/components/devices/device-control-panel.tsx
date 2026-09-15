'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getDeviceCommands,
  getDevicePresets,
  getDeviceWsUrl,
  gotoDevicePreset,
  ptzControl,
  restartDevice,
  saveDevicePreset,
  type Device,
  type DeviceCommandItem,
  type DevicePreset,
} from '@/lib/api/devices';

const CMD_TYPE_LABEL: Record<string, string> = {
  ptz_control: '云台点动',
  ptz_goto: '云台指向',
  ptz_preset: '预置位',
  restart: '远程重启',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-[#8b9bb4]',
  sent: 'text-[#3b82f6]',
  delivered: 'text-[#06b6d4]',
  executed: 'text-[#10b981]',
  failed: 'text-[#ef4444]',
  timeout: 'text-[#f59e0b]',
};

function formatTime(value?: string | null): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return value;
  }
}

type DeviceControlPanelProps = {
  device: Device;
  canControl?: boolean;
  compact?: boolean;
  onPoseChange?: (pan: number | null, tilt: number | null) => void;
  onMessage?: (msg: string) => void;
};

/**
 * 设备云台控制 / 远程重启 / 指令历史 / 预置位
 */
export default function DeviceControlPanel({
  device,
  canControl = true,
  compact = false,
  onPoseChange,
  onMessage,
}: DeviceControlPanelProps) {
  const isDual = device.device_type === 'dual_camera';
  const online = device.status === 'online' || device.status === 'alarm';
  const [speed, setSpeed] = useState(5);
  const [pan, setPan] = useState<number | null>(
    device.pan_angle != null ? Number(device.pan_angle) : null
  );
  const [tilt, setTilt] = useState<number | null>(
    device.tilt_angle != null ? Number(device.tilt_angle) : null
  );
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [commands, setCommands] = useState<DeviceCommandItem[]>([]);
  const [presets, setPresets] = useState<DevicePreset[]>([]);
  const [restartOpen, setRestartOpen] = useState(false);
  const [restartStep, setRestartStep] = useState<1 | 2>(1);
  const [presetName, setPresetName] = useState('');
  const [presetId, setPresetId] = useState(1);
  const [jogging, setJogging] = useState(false);

  const notify = useCallback(
    (text: string) => {
      setMsg(text);
      onMessage?.(text);
    },
    [onMessage]
  );

  const refreshCommands = useCallback(async () => {
    try {
      const res = await getDeviceCommands(device.id, { limit: 20 });
      setCommands(res.results);
    } catch {
      /* ignore */
    }
  }, [device.id]);

  const refreshPresets = useCallback(async () => {
    if (!isDual) return;
    try {
      const res = await getDevicePresets(device.id);
      setPresets(res.results);
    } catch {
      /* ignore */
    }
  }, [device.id, isDual]);

  useEffect(() => {
    setPan(device.pan_angle != null ? Number(device.pan_angle) : null);
    setTilt(device.tilt_angle != null ? Number(device.tilt_angle) : null);
  }, [device.id, device.pan_angle, device.tilt_angle]);

  useEffect(() => {
    void refreshCommands();
    void refreshPresets();
  }, [refreshCommands, refreshPresets]);

  useEffect(() => {
    const url = getDeviceWsUrl(device.device_id);
    if (!url) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(url);
      } catch {
        retry = setTimeout(connect, 4000);
        return;
      }
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string) as {
            type?: string;
            data?: {
              pan_angle?: number | null;
              tilt_angle?: number | null;
              status?: string;
              id?: number;
            };
          };
          if (data.type === 'pose' && data.data) {
            const p = data.data.pan_angle ?? null;
            const t = data.data.tilt_angle ?? null;
            if (p != null) setPan(Number(p));
            if (t != null) setTilt(Number(t));
            onPoseChange?.(p != null ? Number(p) : null, t != null ? Number(t) : null);
          }
          if (data.type === 'command_status') {
            void refreshCommands();
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 4000);
      };
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [device.device_id, onPoseChange, refreshCommands]);

  const sendPtz = async (direction: string) => {
    if (!canControl || !isDual) return;
    if (!online && direction !== 'stop') {
      notify('设备离线，无法控制云台');
      return;
    }
    setBusy(true);
    try {
      const res = await ptzControl(device.id, direction, speed);
      notify(res.message || `已发送: ${direction}`);
      void refreshCommands();
    } catch (err) {
      notify(err instanceof Error ? err.message : '云台控制失败');
    } finally {
      setBusy(false);
    }
  };

  const onJogDown = (direction: string) => {
    setJogging(true);
    void sendPtz(direction);
  };

  const onJogUp = () => {
    if (!jogging) return;
    setJogging(false);
    void sendPtz('stop');
  };

  const confirmRestart = async () => {
    if (!canControl) return;
    setBusy(true);
    try {
      const res = await restartDevice(device.id);
      notify(res.message || '重启指令已发送');
      setRestartOpen(false);
      setRestartStep(1);
      void refreshCommands();
    } catch (err) {
      notify(err instanceof Error ? err.message : '远程重启失败');
    } finally {
      setBusy(false);
    }
  };

  const handleSavePreset = async () => {
    if (!canControl || !isDual) return;
    setBusy(true);
    try {
      await saveDevicePreset(device.id, {
        preset_id: presetId,
        name: presetName || `预置位${presetId}`,
        save_current: true,
      });
      notify(`预置位 ${presetId} 已保存`);
      setPresetName('');
      void refreshPresets();
    } catch (err) {
      notify(err instanceof Error ? err.message : '保存预置位失败');
    } finally {
      setBusy(false);
    }
  };

  const handleGotoPreset = async (pid: number) => {
    if (!canControl) return;
    setBusy(true);
    try {
      const res = await gotoDevicePreset(device.id, pid, speed);
      notify(res.message || '已跳转预置位');
      void refreshCommands();
    } catch (err) {
      notify(err instanceof Error ? err.message : '跳转失败');
    } finally {
      setBusy(false);
    }
  };

  const btnBase =
    'px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded select-none disabled:opacity-40';
  const btnActive = 'hover:border-[#3b82f6] hover:text-[#3b82f6] active:bg-[#3b82f6]/20';

  return (
    <div className={`space-y-3 ${compact ? '' : ''}`}>
      {isDual && (
        <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] text-[#8b9bb4]">云台控制</div>
            <div className="text-[10px] text-[#8b9bb4] font-mono">
              水平 {pan ?? '-'}° / 垂直 {tilt ?? '-'}°
            </div>
          </div>

          {!online && (
            <div className="text-[11px] text-[#f59e0b] mb-2">设备非在线状态，云台点动已禁用</div>
          )}

          <div className="flex flex-wrap items-start gap-4">
            <div className="grid grid-cols-3 gap-1 w-[132px]">
              <div />
              <button
                type="button"
                disabled={!canControl || !online || busy}
                className={`${btnBase} ${btnActive}`}
                onMouseDown={() => onJogDown('up')}
                onMouseUp={onJogUp}
                onMouseLeave={onJogUp}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onJogDown('up');
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onJogUp();
                }}
              >
                ↑
              </button>
              <div />
              <button
                type="button"
                disabled={!canControl || !online || busy}
                className={`${btnBase} ${btnActive}`}
                onMouseDown={() => onJogDown('left')}
                onMouseUp={onJogUp}
                onMouseLeave={onJogUp}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onJogDown('left');
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onJogUp();
                }}
              >
                ←
              </button>
              <button
                type="button"
                disabled={!canControl || busy}
                className={`${btnBase} hover:border-[#ef4444] hover:text-[#ef4444]`}
                onClick={() => void sendPtz('stop')}
              >
                停
              </button>
              <button
                type="button"
                disabled={!canControl || !online || busy}
                className={`${btnBase} ${btnActive}`}
                onMouseDown={() => onJogDown('right')}
                onMouseUp={onJogUp}
                onMouseLeave={onJogUp}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onJogDown('right');
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onJogUp();
                }}
              >
                →
              </button>
              <div />
              <button
                type="button"
                disabled={!canControl || !online || busy}
                className={`${btnBase} ${btnActive}`}
                onMouseDown={() => onJogDown('down')}
                onMouseUp={onJogUp}
                onMouseLeave={onJogUp}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onJogDown('down');
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onJogUp();
                }}
              >
                ↓
              </button>
              <div />
            </div>

            <div className="flex-1 min-w-[160px] space-y-2">
              <label className="flex items-center gap-2 text-[11px] text-[#8b9bb4]">
                速度
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="flex-1"
                  disabled={!canControl}
                />
                <span className="font-mono text-[#e8f1ff] w-4">{speed}</span>
              </label>

              <div className="text-[10px] text-[#8b9bb4]">预置位</div>
              <div className="flex flex-wrap gap-1.5">
                {presets.length === 0 && (
                  <span className="text-[10px] text-[#8b9bb4]">暂无预置位，可保存当前姿态</span>
                )}
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!canControl || !online || busy}
                    onClick={() => void handleGotoPreset(p.preset_id)}
                    className={`${btnBase} ${btnActive}`}
                    title={`${p.name} (${p.pan_angle}°, ${p.tilt_angle}°)`}
                  >
                    #{p.preset_id} {p.name}
                  </button>
                ))}
              </div>
              {canControl && (
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={presetId}
                    onChange={(e) => setPresetId(Number(e.target.value))}
                    className="px-2 py-1 text-[11px] bg-[#0a1628] border border-[#1e3a5f] rounded text-[#e8f1ff]"
                  >
                    {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        位{n}
                      </option>
                    ))}
                  </select>
                  <input
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="名称（可选）"
                    className="px-2 py-1 text-[11px] bg-[#0a1628] border border-[#1e3a5f] rounded text-[#e8f1ff] w-28"
                  />
                  <button
                    type="button"
                    disabled={busy || pan == null}
                    onClick={() => void handleSavePreset()}
                    className="px-2 py-1 text-[11px] bg-[#3b82f6]/20 text-[#93c5fd] border border-[#3b82f6]/40 rounded"
                  >
                    保存当前姿态
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canControl && (
          <button
            type="button"
            disabled={busy || !online}
            onClick={() => {
              setRestartOpen(true);
              setRestartStep(1);
            }}
            className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#ef4444] hover:text-[#ef4444] disabled:opacity-40"
          >
            远程重启
          </button>
        )}
        <button
          type="button"
          onClick={() => void refreshCommands()}
          className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6]"
        >
          刷新指令
        </button>
        {!canControl && (
          <span className="text-[10px] text-[#8b9bb4]">当前账号无设备控制权限</span>
        )}
      </div>

      {msg && (
        <div className="text-[11px] text-[#93c5fd] bg-[#3b82f6]/10 border border-[#3b82f6]/30 rounded px-3 py-2">
          {msg}
        </div>
      )}

      <div className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
        <div className="text-[10px] text-[#8b9bb4] mb-2">指令状态</div>
        {commands.length === 0 ? (
          <div className="text-xs text-[#8b9bb4] py-1">暂无指令记录</div>
        ) : (
          <div className="max-h-40 overflow-auto space-y-1">
            {commands.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 text-[11px] border-b border-[#1e3a5f]/40 py-1"
              >
                <div className="min-w-0">
                  <span className="text-[#e8f1ff]">
                    {CMD_TYPE_LABEL[c.command_type] || c.command_type}
                  </span>
                  <span className="text-[#8b9bb4] ml-2 font-mono truncate">
                    {c.operator_name || '-'} · {formatTime(c.created_at)}
                  </span>
                </div>
                <span className={`shrink-0 ${STATUS_COLOR[c.status] || 'text-[#8b9bb4]'}`}>
                  {c.status_display || c.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {restartOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-[#152238] border border-[#1e3a5f] rounded-lg p-5 space-y-3">
            <div className="text-sm font-medium text-[#e8f1ff]">
              {restartStep === 1 ? '确认远程重启' : '最终确认'}
            </div>
            <p className="text-xs text-[#8b9bb4] leading-relaxed">
              {restartStep === 1
                ? `将对设备「${device.device_name}」（${device.device_id}）发送重启指令，视频与上报可能中断 1–3 分钟。`
                : '再次确认：重启后若长时间未上线，请安排现场巡检。是否继续？'}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setRestartOpen(false);
                  setRestartStep(1);
                }}
                className="px-3 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded"
              >
                取消
              </button>
              {restartStep === 1 ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRestartStep(2)}
                  className="px-3 py-1.5 text-xs bg-[#f59e0b] text-white rounded"
                >
                  下一步
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmRestart()}
                  className="px-3 py-1.5 text-xs bg-[#ef4444] text-white rounded"
                >
                  {busy ? '发送中…' : '确认重启'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
