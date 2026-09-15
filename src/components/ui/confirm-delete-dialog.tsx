'use client';

import { useEffect, useState } from 'react';

export type ConfirmTarget = {
  id: number;
  name: string;
} | null;

interface ConfirmDeleteDialogProps {
  open: boolean;
  title: string;
  targetName: string;
  loading?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 两步删除确认：避免 window.confirm 在部分环境被拦截导致“点击无反应”。
 */
export default function ConfirmDeleteDialog({
  open,
  title,
  targetName,
  loading = false,
  error = '',
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    if (open) setStep(1);
  }, [open, targetName]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-sm bg-[#152238] border border-[#1e3a5f] rounded-lg p-5 space-y-4 shadow-xl">
        <div>
          <h2 className="text-sm font-semibold text-[#e8f1ff]">{title}</h2>
          <p className="mt-2 text-xs text-[#8b9bb4] leading-relaxed">
            {step === 1 ? (
              <>
                确认删除「
                <span className="text-[#e8f1ff]">{targetName}</span>
                」吗？
              </>
            ) : (
              <>
                再次确认：删除「
                <span className="text-[#ef4444]">{targetName}</span>
                」后不可恢复，是否继续？
              </>
            )}
          </p>
          {error && <p className="mt-2 text-xs text-[#ef4444]">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs text-[#8b9bb4] hover:bg-[#0f1e35] disabled:opacity-50"
          >
            取消
          </button>
          {step === 1 ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => setStep(2)}
              className="px-3 py-1.5 rounded text-xs bg-[#ef4444]/90 text-white hover:bg-[#ef4444] disabled:opacity-50"
            >
              确认删除
            </button>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={onConfirm}
              className="px-3 py-1.5 rounded text-xs bg-[#ef4444] text-white hover:bg-[#dc2626] disabled:opacity-50"
            >
              {loading ? '删除中...' : '最终确认删除'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
