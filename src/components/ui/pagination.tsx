'use client';

import { useState, useCallback, useEffect } from 'react';

interface PaginationProps {
  current: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** 紧凑模式：适合窄侧栏 */
  compact?: boolean;
  className?: string;
}

export default function Pagination({
  current,
  pageSize,
  total,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
  compact = false,
  className = '',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
  // 数据变少后当前页越界时，自动回退到最后一页
  const safeCurrent = Math.min(Math.max(1, current), totalPages);

  useEffect(() => {
    if (current !== safeCurrent) {
      onPageChange(safeCurrent);
    }
  }, [current, safeCurrent, onPageChange]);

  const getVisiblePages = useCallback(() => {
    const pages: (number | string)[] = [];
    const maxButtons = compact ? 3 : 7;
    if (totalPages <= maxButtons) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (compact) {
      if (safeCurrent <= 2) {
        pages.push(1, 2, '...', totalPages);
      } else if (safeCurrent >= totalPages - 1) {
        pages.push(1, '...', totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', safeCurrent, '...', totalPages);
      }
    } else {
      pages.push(1);
      if (safeCurrent > 3) pages.push('...');
      const start = Math.max(2, safeCurrent - 1);
      const end = Math.min(totalPages - 1, safeCurrent + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (safeCurrent < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  }, [compact, safeCurrent, totalPages]);

  if (compact) {
    return (
      <div
        className={`flex flex-col gap-2 px-3 py-2 bg-[#0f1e35]/80 ${className}`.trim()}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-[#8b9bb4] font-mono shrink-0">
            共 <span className="text-[#e8f1ff]">{total}</span> 条
          </span>
          {onPageSizeChange && (
            <div className="flex items-center gap-1">
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                aria-label="每页条数"
                className="h-6 bg-[#152238] border border-[#1e3a5f] rounded px-1.5 text-[10px] text-[#e8f1ff] font-mono focus:outline-none focus:border-[#3b82f6]"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}/页
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, safeCurrent - 1))}
            disabled={safeCurrent === 1}
            className="h-6 min-w-6 px-1.5 text-[10px] rounded border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="上一页"
          >
            ‹
          </button>
          {getVisiblePages().map((page, idx) =>
            typeof page === 'string' ? (
              <span key={`ellipsis-${idx}`} className="px-0.5 text-[10px] text-[#5a6a82]">
                …
              </span>
            ) : (
              <button
                type="button"
                key={page}
                onClick={() => onPageChange(page)}
                className={`h-6 min-w-6 px-1.5 text-[10px] rounded font-mono transition-colors ${
                  page === safeCurrent
                    ? 'bg-[#3b82f6] text-white border border-[#3b82f6]'
                    : 'border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6]'
                }`}
              >
                {page}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, safeCurrent + 1))}
            disabled={safeCurrent === totalPages}
            className="h-6 min-w-6 px-1.5 text-[10px] rounded border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="下一页"
          >
            ›
          </button>
          <span className="ml-1 text-[10px] text-[#5a6a82] font-mono whitespace-nowrap">
            {safeCurrent}/{totalPages}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#0f1e35] border border-[#1e3a5f] rounded-lg ${className}`.trim()}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs text-[#8b9bb4] font-mono">
          共 <span className="text-[#e8f1ff]">{total}</span> 条
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8b9bb4]">每页</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-[#152238] border border-[#1e3a5f] rounded px-2 py-1 text-xs text-[#e8f1ff] font-mono focus:outline-none focus:border-[#3b82f6]"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span className="text-xs text-[#8b9bb4]">条</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 flex-wrap justify-end">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safeCurrent - 1))}
          disabled={safeCurrent === 1}
          className="px-2 py-1 text-xs rounded border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          上一页
        </button>

        {getVisiblePages().map((page, idx) =>
          typeof page === 'string' ? (
            <span key={`ellipsis-${idx}`} className="px-2 text-xs text-[#8b9bb4]">
              ...
            </span>
          ) : (
            <button
              type="button"
              key={page}
              onClick={() => onPageChange(page)}
              className={`px-2.5 py-1 text-xs rounded font-mono transition-colors ${
                page === safeCurrent
                  ? 'bg-[#3b82f6] text-white border border-[#3b82f6]'
                  : 'border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6]'
              }`}
            >
              {page}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safeCurrent + 1))}
          disabled={safeCurrent === totalPages}
          className="px-2 py-1 text-xs rounded border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          下一页
        </button>

        <span className="ml-2 text-xs text-[#8b9bb4] font-mono">
          第 <span className="text-[#e8f1ff]">{safeCurrent}</span> / {totalPages} 页
        </span>
      </div>
    </div>
  );
}

export function usePagination(defaultPageSize = 10) {
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const onPageChange = useCallback((page: number) => {
    setCurrent(Math.max(1, page));
  }, []);

  const onPageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrent(1);
  }, []);

  return {
    current,
    pageSize,
    setCurrent,
    setPageSize,
    onPageChange,
    onPageSizeChange,
  };
}
