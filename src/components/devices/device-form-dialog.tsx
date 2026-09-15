'use client';

import { useState, useEffect, useMemo, FormEvent } from 'react';
import {
  createDevice,
  updateDevice,
  type CreateDeviceData,
  type Device,
} from '@/lib/api/devices';
import { getForestZoneOptions, type ForestZoneOption } from '@/lib/api/organization';

interface DeviceFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** 传入则为编辑模式 */
  device?: Device | null;
}

const deviceTypes = [
  { value: 'dual_camera', label: '双目智能监测云台' },
  { value: 'env_sensor', label: '多参数环境传感器' },
  { value: 'ai_gateway', label: 'AI边缘网关' },
  { value: 'drone', label: '无人机' },
];

const communicationTypes = [
  { value: '4g', label: '4G' },
  { value: 'lora', label: 'LoRa' },
  { value: 'wifi', label: 'WiFi' },
  { value: 'ethernet', label: '有线' },
];

const statusOptions = [
  { value: 'online', label: '在线' },
  { value: 'offline', label: '离线' },
  { value: 'alarm', label: '告警' },
  { value: 'maintenance', label: '维护中' },
];

const emptyForm: CreateDeviceData = {
  device_id: '',
  device_name: '',
  device_type: 'dual_camera',
  status: 'offline',
  region: '',
  forest_zone: '',
  forest_zone_ref: null,
  longitude: undefined,
  latitude: undefined,
  altitude: undefined,
  firmware_version: '',
  hardware_version: '',
  manufacturer: '',
  communication_type: '4g',
  signal_strength: 0,
  battery_level: undefined,
};

function toNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function deviceToForm(device: Device): CreateDeviceData {
  return {
    device_id: device.device_id,
    device_name: device.device_name,
    device_type: device.device_type,
    status: device.status || 'offline',
    region: device.region || '',
    forest_zone: device.forest_zone || '',
    forest_zone_ref: device.forest_zone_ref ?? null,
    longitude: toNumber(device.longitude),
    latitude: toNumber(device.latitude),
    altitude: toNumber(device.altitude),
    firmware_version: device.firmware_version || '',
    hardware_version: device.hardware_version || '',
    manufacturer: device.manufacturer || '',
    communication_type: device.communication_type || '4g',
    signal_strength: device.signal_strength ?? 0,
    battery_level: device.battery_level ?? undefined,
  };
}

export default function DeviceFormDialog({
  open,
  onClose,
  onSuccess,
  device = null,
}: DeviceFormDialogProps) {
  const isEdit = !!device;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<CreateDeviceData>(emptyForm);
  const [zoneOptions, setZoneOptions] = useState<ForestZoneOption[]>([]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setFormData(device ? deviceToForm(device) : { ...emptyForm });
    void getForestZoneOptions()
      .then(setZoneOptions)
      .catch(() => setZoneOptions([]));
  }, [open, device]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isEdit && device) {
        const { device_id: _id, ...payload } = formData;
        await updateDevice(device.id, payload);
      } else {
        await createDevice(formData);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEdit ? '更新设备失败' : '添加设备失败');
    } finally {
      setLoading(false);
    }
  };

  const selectedZoneRegions = useMemo(() => {
    const zone = zoneOptions.find((z) => z.id === formData.forest_zone_ref);
    const fromZone =
      zone?.regions && zone.regions.length > 0
        ? zone.regions
        : zone?.region
          ? [zone.region]
          : [];
    // 编辑时保留历史片区（即使已从林区主数据移除）
    const current = (formData.region || '').trim();
    if (current && !fromZone.includes(current)) {
      return [...fromZone, current];
    }
    return fromZone;
  }, [zoneOptions, formData.forest_zone_ref, formData.region]);

  if (!open) return null;

  const inputClass =
    'w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6]';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#152238] border border-[#1e3a5f] rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-[#1e3a5f] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#e8f1ff]">
            {isEdit ? '编辑设备' : '添加设备'}
          </h2>
          <button
            onClick={onClose}
            className="text-[#8b9bb4] hover:text-[#e8f1ff] transition-colors"
            type="button"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#8b9bb4] mb-1.5">设备ID *</label>
                <input
                  type="text"
                  required
                  disabled={isEdit}
                  value={formData.device_id}
                  onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                  className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                  placeholder="如：DC-001"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8b9bb4] mb-1.5">设备名称 *</label>
                <input
                  type="text"
                  required
                  value={formData.device_name}
                  onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
                  className={inputClass}
                  placeholder="如：北区01号云台"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#8b9bb4] mb-1.5">设备类型 *</label>
                <select
                  required
                  value={formData.device_type}
                  onChange={(e) => setFormData({ ...formData, device_type: e.target.value })}
                  className={inputClass}
                >
                  {deviceTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#8b9bb4] mb-1.5">通信方式</label>
                <select
                  value={formData.communication_type}
                  onChange={(e) => setFormData({ ...formData, communication_type: e.target.value })}
                  className={inputClass}
                >
                  {communicationTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isEdit && (
              <div>
                <label className="block text-xs text-[#8b9bb4] mb-1.5">状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className={inputClass}
                >
                  {statusOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="border-t border-[#1e3a5f] pt-4">
              <h3 className="text-sm font-medium text-[#e8f1ff] mb-3">位置信息</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">经度</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={formData.longitude ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        longitude: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className={inputClass}
                    placeholder="116.397428"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">纬度</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={formData.latitude ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        latitude: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className={inputClass}
                    placeholder="39.908765"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">海拔 (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.altitude ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        altitude: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className={inputClass}
                    placeholder="500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">所属林区 *</label>
                  <select
                    value={formData.forest_zone_ref ?? ''}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      const zone = zoneOptions.find((z) => z.id === id);
                      const zoneRegions =
                        zone?.regions && zone.regions.length > 0
                          ? zone.regions
                          : zone?.region
                            ? [zone.region]
                            : [];
                      setFormData({
                        ...formData,
                        forest_zone_ref: id,
                        forest_zone: zone?.name || '',
                        // 切换林区时重置片区；若仅一个片区则自动带出
                        region: zoneRegions.length === 1 ? zoneRegions[0] : '',
                      });
                    }}
                    className={inputClass}
                    required
                  >
                    <option value="">请选择本组织林区</option>
                    {zoneOptions.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} ({z.code})
                      </option>
                    ))}
                  </select>
                  {zoneOptions.length === 0 && (
                    <p className="text-[10px] text-[#f59e0b] mt-1">
                      暂无启用林区，请先在「组织管理 → 林区管理」创建
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">所属片区</label>
                  <select
                    value={formData.region || ''}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    disabled={!formData.forest_zone_ref}
                    className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <option value="">
                      {!formData.forest_zone_ref
                        ? '请先选择林区'
                        : selectedZoneRegions.length === 0
                          ? '该林区暂无片区'
                          : '请选择片区（可选）'}
                    </option>
                    {selectedZoneRegions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {formData.forest_zone_ref && selectedZoneRegions.length === 0 && (
                    <p className="text-[10px] text-[#f59e0b] mt-1">
                      请先在「林区管理」为该林区添加片区
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-[#1e3a5f] pt-4">
              <h3 className="text-sm font-medium text-[#e8f1ff] mb-3">设备属性</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">固件版本</label>
                  <input
                    type="text"
                    value={formData.firmware_version}
                    onChange={(e) => setFormData({ ...formData, firmware_version: e.target.value })}
                    className={inputClass}
                    placeholder="v1.0.0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">硬件版本</label>
                  <input
                    type="text"
                    value={formData.hardware_version}
                    onChange={(e) => setFormData({ ...formData, hardware_version: e.target.value })}
                    className={inputClass}
                    placeholder="HW-1.0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">厂商</label>
                  <input
                    type="text"
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    className={inputClass}
                    placeholder="如：海康威视"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">信号强度 (0-5)</label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={formData.signal_strength ?? 0}
                    onChange={(e) =>
                      setFormData({ ...formData, signal_strength: parseInt(e.target.value, 10) || 0 })
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">电池电量 (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.battery_level ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        battery_level: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      })
                    }
                    className={inputClass}
                    placeholder="100"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>
        </form>

        <div className="px-6 py-4 border-t border-[#1e3a5f] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] disabled:bg-[#3b82f6]/50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (isEdit ? '保存中...' : '添加中...') : isEdit ? '保存修改' : '确认添加'}
          </button>
        </div>
      </div>
    </div>
  );
}
