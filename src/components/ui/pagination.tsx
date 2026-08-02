'use client';

import { useState, useCallback } from 'react';

interface PaginationProps {
  current: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export default function Pagination({
  current,
  pageSize,
  total,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const getVisiblePages = useCallback(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push('...');
      const start = Math.max(2, current - 1);
      const end = Math.min(totalPages - 1, current + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (current < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  }, [current, totalPages]);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[#0f1e35] border border-[#1e3a5f] rounded-lg">
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

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, current - 1))}
          disabled={current === 1}
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
              key={page}
              onClick={() => onPageChange(page)}
              className={`px-2.5 py-1 text-xs rounded font-mono transition-colors ${
                page === current
                  ? 'bg-[#3b82f6] text-white border border-[#3b82f6]'
                  : 'border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6]'
              }`}
            >
              {page}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(Math.min(totalPages, current + 1))}
          disabled={current === totalPages}
          className="px-2 py-1 text-xs rounded border border-[#1e3a5f] text-[#8b9bb4] hover:border-[#3b82f6] hover:text-[#3b82f6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          下一页
        </button>

        <span className="ml-2 text-xs text-[#8b9bb4] font-mono">
          第 <span className="text-[#e8f1ff]">{current}</span> / {totalPages} 页
        </span>
      </div>
    </div>
  );
}

export function usePagination(defaultPageSize = 10) {
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  return {
    current,
    pageSize,
    setCurrent,
    setPageSize,
    onPageChange: setCurrent,
    onPageSizeChange: (size: number) => {
      setPageSize(size);
      setCurrent(1);
    },
  };
}
