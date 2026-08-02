'use client';

import { useState } from 'react';

type SettingsTab = 'general' | 'alert-rules' | 'device' | 'notification' | 'system';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'general', label: '基本设置' },
    { key: 'alert-rules', label: '告警规则' },
    { key: 'device', label: '设备配置' },
    { key: 'notification', label: '通知设置' },
    { key: 'system', label: '系统管理' },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[#e8f1ff]">系统设置</h1>

      <div className="flex-1 grid grid-cols-[200px_1fr] gap-4 min-h-0">
        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-2 h-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                activeTab === tab.key ? 'bg-[#3b82f6]/15 text-[#3b82f6]' : 'text-[#8b9bb4] hover:text-[#e8f1ff] hover:bg-[#0f1e35]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-[#152238] border border-[#1e3a5f] rounded-lg p-6 overflow-auto">
          {activeTab === 'general' && <GeneralSettings />}
          {activeTab === 'alert-rules' && <AlertRuleSettings />}
          {activeTab === 'device' && <DeviceSettings />}
          {activeTab === 'notification' && <NotificationSettings />}
          {activeTab === 'system' && <SystemSettings />}
        </div>
      </div>
    </div>
  );
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-[#e8f1ff] mb-3 pb-2 border-b border-[#1e3a5f]">{title}</h3>
      {children}
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="text-xs text-[#e8f1ff]">{label}</div>
        {description && <div className="text-[10px] text-[#8b9bb4] mt-0.5">{description}</div>}
      </div>
      {children}
    </div>
  );
}

function GeneralSettings() {
  return (
    <>
      <SettingSection title="平台信息">
        <SettingRow label="平台名称" description="显示在页面标题和侧边栏">
          <input type="text" defaultValue="林智森林智能监控平台" className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] w-64" />
        </SettingRow>
        <SettingRow label="数据刷新间隔" description="大屏数据自动刷新周期">
          <select className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]">
            <option>5秒</option>
            <option>10秒</option>
            <option>30秒</option>
            <option>60秒</option>
          </select>
        </SettingRow>
        <SettingRow label="默认地图图层" description="进入大屏时默认显示的地图图层">
          <select className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]">
            <option>标准地图</option>
            <option>热力图</option>
            <option>火险等级图</option>
          </select>
        </SettingRow>
      </SettingSection>
      <SettingSection title="区域管理">
        <SettingRow label="监控区域" description="当前平台管理的林区范围">
          <span className="text-xs text-[#8b9bb4]">6个林区 / 1,380台设备</span>
        </SettingRow>
        <SettingRow label="坐标系" description="GPS坐标参考系统">
          <select className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]">
            <option>WGS-84</option>
            <option>CGCS2000</option>
          </select>
        </SettingRow>
      </SettingSection>
      <div className="flex justify-end gap-3 pt-4 border-t border-[#1e3a5f]">
        <button className="px-4 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">取消</button>
        <button className="px-4 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors">保存设置</button>
      </div>
    </>
  );
}

function AlertRuleSettings() {
  return (
    <>
      <SettingSection title="告警分级规则">
        <div className="space-y-3">
          {[
            { level: '一级(紧急)', desc: '多设备交叉确认 / AI置信度≥95%', time: '30秒', color: '#ef4444' },
            { level: '二级(预警)', desc: '双光谱确认+热源 / AI置信度≥85%', time: '2分钟', color: '#f59e0b' },
            { level: '三级(提示)', desc: '单AI置信度≥70%', time: '5分钟', color: '#3b82f6' },
          ].map((rule) => (
            <div key={rule.level} className="bg-[#0f1e35] border border-[#1e3a5f] rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: rule.color }}>{rule.level}</span>
                <span className="text-[10px] text-[#8b9bb4]">响应时限: {rule.time}</span>
              </div>
              <div className="text-[10px] text-[#8b9bb4]">{rule.desc}</div>
              <button className="text-[10px] text-[#3b82f6] mt-2 hover:text-[#60a5fa]">编辑规则</button>
            </div>
          ))}
        </div>
      </SettingSection>
      <SettingSection title="AI识别参数">
        <SettingRow label="烟火识别置信度阈值" description="低于此阈值的识别结果不触发告警">
          <div className="flex items-center gap-2">
            <input type="range" min="50" max="99" defaultValue="85" className="w-32" />
            <span className="text-xs text-[#e8f1ff] font-mono w-10">85%</span>
          </div>
        </SettingRow>
        <SettingRow label="干扰源过滤" description="自动过滤已知干扰源（≥500类）">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="accent-[#3b82f6]" />
            <span className="text-xs text-[#8b9bb4]">已启用</span>
          </label>
        </SettingRow>
      </SettingSection>
      <SettingSection title="环境阈值">
        <SettingRow label="温度告警阈值">
          <input type="text" defaultValue="35℃" className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] w-32" />
        </SettingRow>
        <SettingRow label="湿度告警阈值">
          <input type="text" defaultValue="30%RH" className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] w-32" />
        </SettingRow>
        <SettingRow label="可燃物含水率阈值">
          <input type="text" defaultValue="30%" className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6] w-32" />
        </SettingRow>
      </SettingSection>
      <div className="flex justify-end gap-3 pt-4 border-t border-[#1e3a5f]">
        <button className="px-4 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">取消</button>
        <button className="px-4 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors">保存设置</button>
      </div>
    </>
  );
}

function DeviceSettings() {
  return (
    <>
      <SettingSection title="采集参数">
        <SettingRow label="视频采集频率" description="可见光相机采集间隔">
          <select className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]">
            <option>连续采集</option>
            <option>间隔5秒</option>
            <option>间隔10秒</option>
            <option>事件触发</option>
          </select>
        </SettingRow>
        <SettingRow label="环境传感器上报周期" description="温湿度、风速等参数上报间隔">
          <select className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]">
            <option>1分钟</option>
            <option>5分钟</option>
            <option>10分钟</option>
          </select>
        </SettingRow>
        <SettingRow label="视频编码格式" description="遵循GB/T 43958-2024标准">
          <select className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]">
            <option>H.265 (自适应)</option>
            <option>H.264</option>
          </select>
        </SettingRow>
      </SettingSection>
      <SettingSection title="离线策略">
        <SettingRow label="本地缓存时长" description="断网时本地存储视频时长">
          <select className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]">
            <option>≥7天</option>
            <option>≥3天</option>
            <option>≥14天</option>
          </select>
        </SettingRow>
        <SettingRow label="断网续传" description="网络恢复后自动补传缓存数据">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="accent-[#3b82f6]" />
            <span className="text-xs text-[#8b9bb4]">已启用</span>
          </label>
        </SettingRow>
      </SettingSection>
      <div className="flex justify-end gap-3 pt-4 border-t border-[#1e3a5f]">
        <button className="px-4 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">取消</button>
        <button className="px-4 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors">保存设置</button>
      </div>
    </>
  );
}

function NotificationSettings() {
  return (
    <>
      <SettingSection title="推送渠道">
        <SettingRow label="站内信" description="平台内消息通知">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="accent-[#3b82f6]" />
            <span className="text-xs text-[#8b9bb4]">已启用</span>
          </label>
        </SettingRow>
        <SettingRow label="App推送" description="护林员App消息推送">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="accent-[#3b82f6]" />
            <span className="text-xs text-[#8b9bb4]">已启用</span>
          </label>
        </SettingRow>
        <SettingRow label="短信通知" description="二级及以上告警发送短信">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="accent-[#3b82f6]" />
            <span className="text-xs text-[#8b9bb4]">已启用</span>
          </label>
        </SettingRow>
        <SettingRow label="语音电话" description="一级告警自动拨打值班电话">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="accent-[#3b82f6]" />
            <span className="text-xs text-[#8b9bb4]">已启用</span>
          </label>
        </SettingRow>
        <SettingRow label="林草局专线" description="一级告警推送至林草局">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="accent-[#3b82f6]" />
            <span className="text-xs text-[#8b9bb4]">已启用</span>
          </label>
        </SettingRow>
      </SettingSection>
      <SettingSection title="值班排班">
        <SettingRow label="当前值班组" description="今日值班人员">
          <span className="text-xs text-[#e8f1ff]">A组 (张明、李强、王磊)</span>
        </SettingRow>
        <SettingRow label="排班模式">
          <select className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]">
            <option>三班倒</option>
            <option>两班倒</option>
            <option>自定义</option>
          </select>
        </SettingRow>
      </SettingSection>
      <div className="flex justify-end gap-3 pt-4 border-t border-[#1e3a5f]">
        <button className="px-4 py-1.5 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">取消</button>
        <button className="px-4 py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors">保存设置</button>
      </div>
    </>
  );
}

function SystemSettings() {
  return (
    <>
      <SettingSection title="系统信息">
        <SettingRow label="系统版本" description="当前平台版本号">
          <span className="text-xs text-[#e8f1ff] font-mono">v2.1.0</span>
        </SettingRow>
        <SettingRow label="IoT平台" description="阿里云IoT企业版">
          <span className="text-xs text-[#10b981]">已连接</span>
        </SettingRow>
        <SettingRow label="AI引擎" description="达摩院视觉大模型">
          <span className="text-xs text-[#10b981]">运行中</span>
        </SettingRow>
        <SettingRow label="通信协议" description="遵循Alink JSON格式">
          <span className="text-xs text-[#e8f1ff] font-mono">Alink v1.0</span>
        </SettingRow>
      </SettingSection>
      <SettingSection title="数据管理">
        <SettingRow label="数据保留策略" description="历史数据保留时长">
          <select className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]">
            <option>90天</option>
            <option>180天</option>
            <option>365天</option>
            <option>永久保留</option>
          </select>
        </SettingRow>
        <SettingRow label="视频存储" description="录像文件存储策略">
          <select className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-3 py-1.5 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]">
            <option>告警片段保留30天</option>
            <option>全量保留7天</option>
            <option>全量保留30天</option>
          </select>
        </SettingRow>
      </SettingSection>
      <SettingSection title="维护操作">
        <SettingRow label="系统备份" description="上次备份时间">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#8b9bb4] font-mono">2026-08-02 03:00</span>
            <button className="px-3 py-1 text-xs border border-[#1e3a5f] text-[#8b9bb4] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors">立即备份</button>
          </div>
        </SettingRow>
        <SettingRow label="清除缓存" description="清除前端缓存数据">
          <button className="px-3 py-1 text-xs border border-[#f59e0b]/30 text-[#f59e0b] rounded hover:bg-[#f59e0b]/10 transition-colors">清除缓存</button>
        </SettingRow>
      </SettingSection>
    </>
  );
}
