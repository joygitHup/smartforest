'use client';

import { useState, useEffect } from 'react';

export default function Header() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      }));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="flex items-center justify-between h-14 px-6 bg-[#0c1a2e] border-b border-[#1e3a5f]">
      <div className="flex items-center gap-4">
        <h2 className="text-sm font-medium text-[#e8f1ff]">森林智能监控平台</h2>
        <div className="flex items-center gap-2 text-xs text-[#8b9bb4]">
          <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
          <span>系统运行正常</span>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <select className="bg-[#152238] border border-[#1e3a5f] rounded px-2 py-1 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]">
            <option>全部林区</option>
            <option>白桦林保护区</option>
            <option>红松保护区</option>
            <option>樟子松林区</option>
            <option>落叶松林区</option>
            <option>云杉林区</option>
          </select>
        </div>
        <div className="text-xs text-[#8b9bb4] font-mono">{time}</div>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#1e3a5f] flex items-center justify-center text-xs text-[#e8f1ff]">管</div>
          <span className="text-xs text-[#8b9bb4]">管理员</span>
        </div>
      </div>
    </header>
  );
}
