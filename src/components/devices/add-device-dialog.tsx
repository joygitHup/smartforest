'use client';

import { useState, FormEvent } from 'react';
import { createDevice, CreateDeviceData } from '@/lib/api/devices';

interface AddDeviceDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
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

export default function AddDeviceDialog({ open, onClose, onSuccess }: AddDeviceDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<CreateDeviceData>({
    device_id: '',
    device_name: '',
    device_type: 'dual_camera',
    status: 'offline',
    region: '',
    forest_zone: '',
    longitude: undefined,
    latitude: undefined,
    altitude: undefined,
    firmware_version: '',
    hardware_version: '',
    manufacturer: '',
    communication_type: '4g',
    signal_strength: 0,
    battery_level: undefined,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await createDevice(formData);
      onSuccess();
      onClose();
      // 重置表单
      setFormData({
        device_id: '',
        device_name: '',
        device_type: 'dual_camera',
        status: 'offline',
        region: '',
        forest_zone: '',
        longitude: undefined,
        latitude: undefined,
        altitude: undefined,
        firmware_version: '',
        hardware_version: '',
        manufacturer: '',
        communication_type: '4g',
        signal_strength: 0,
        battery_level: undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加设备失败');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* 对话框 */}
      <div className="relative bg-[#152238] border border-[#1e3a5f] rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 标题 */}
        <div className="px-6 py-4 border-b border-[#1e3a5f] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#e8f1ff]">添加设备</h2>
          <button
            onClick={onClose}
            className="text-[#8b9bb4] hover:text-[#e8f1ff] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#8b9bb4] mb-1.5">设备ID *</label>
                <input
                  type="text"
                  required
                  value={formData.device_id}
                  onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6]"
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
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6]"
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
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
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
                  className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
                >
                  {communicationTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 位置信息 */}
            <div className="border-t border-[#1e3a5f] pt-4">
              <h3 className="text-sm font-medium text-[#e8f1ff] mb-3">位置信息</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">经度</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={formData.longitude || ''}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6]"
                    placeholder="116.397428"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">纬度</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={formData.latitude || ''}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6]"
                    placeholder="39.908765"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">海拔 (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.altitude || ''}
                    onChange={(e) => setFormData({ ...formData, altitude: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6]"
                    placeholder="500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">所属区域</label>
                  <input
                    type="text"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6]"
                    placeholder="如：北区"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">林区</label>
                  <input
                    type="text"
                    value={formData.forest_zone}
                    onChange={(e) => setFormData({ ...formData, forest_zone: e.target.value })}
                    className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6]"
                    placeholder="如：A区"
                  />
                </div>
              </div>
            </div>

            {/* 设备属性 */}
            <div className="border-t border-[#1e3a5f] pt-4">
              <h3 className="text-sm font-medium text-[#e8f1ff] mb-3">设备属性</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">固件版本</label>
                  <input
                    type="text"
                    value={formData.firmware_version}
                    onChange={(e) => setFormData({ ...formData, firmware_version: e.target.value })}
                    className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6]"
                    placeholder="v1.0.0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">硬件版本</label>
                  <input
                    type="text"
                    value={formData.hardware_version}
                    onChange={(e) => setFormData({ ...formData, hardware_version: e.target.value })}
                    className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6]"
                    placeholder="HW-1.0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">厂商</label>
                  <input
                    type="text"
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6]"
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
                    value={formData.signal_strength}
                    onChange={(e) => setFormData({ ...formData, signal_strength: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b9bb4] mb-1.5">电池电量 (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.battery_level || ''}
                    onChange={(e) => setFormData({ ...formData, battery_level: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-2 text-sm text-[#e8f1ff] placeholder-[#8b9bb4] focus:outline-none focus:border-[#3b82f6]"
                    placeholder="100"
                  />
                </div>
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>
        </form>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-[#1e3a5f] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] disabled:bg-[#3b82f6]/50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '添加中...' : '确认添加'}
          </button>
        </div>
      </div>
    </div>
  );
}
