'use client';

import { AuthGuard } from '@/components/auth-guard';
import AlertRulesPanel from '@/components/alerts/alert-rules-panel';

function AlertRulesPageContent() {
  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-[#e8f1ff]">告警规则</h1>
          <p className="text-[10px] text-[#8b9bb4] mt-0.5">
            规则引擎 · 组织隔离与角色一致 · 支持顶部林区筛选
          </p>
        </div>
      </div>
      <div className="flex-1 min-h-0 bg-[#152238] border border-[#1e3a5f] rounded-lg p-4 overflow-auto">
        <AlertRulesPanel />
      </div>
    </div>
  );
}

export default function AlertRulesPage() {
  return (
    <AuthGuard>
      <AlertRulesPageContent />
    </AuthGuard>
  );
}
