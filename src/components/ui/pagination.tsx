// src/components/ui/pagination.tsx
'use client';
import { useState } from 'react';
interface PaginationProps {
  current: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function usePagination(initialPageSize: number = 10) {
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const onPageChange = (page: number) => {
    setCurrent(page);
  };

  const onPageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrent(1);
  };

  return { current, pageSize, onPageChange, onPageSizeChange };
}

export default function Pagination({
  current,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);

  if (total === 0) return null;

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (current <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (current >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = current - 1; i <= current + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-[#8b9bb4]">
        <span>每页</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="bg-[#0f1e35] border border-[#1e3a5f] rounded px-2 py-1 text-xs text-[#e8f1ff] focus:outline-none focus:border-[#3b82f6]"
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span>条</span>
        <span className="ml-2">
          共 <span className="text-[#e8f1ff]">{total}</span> 条
        </span>
      </div>
      
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(current - 1)}
          disabled={current === 1}
          className="px-2 py-1 text-xs text-[#8b9bb4] border border-[#1e3a5f] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          上一页
        </button>
        
        {getPageNumbers().map((page, index) => (
          <button
            key={index}
            onClick={() => typeof page === 'number' && onPageChange(page)}
            disabled={page === '...'}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              page === current
                ? 'bg-[#3b82f6] text-white'
                : page === '...'
                ? 'text-[#8b9bb4] cursor-default'
                : 'text-[#8b9bb4] border border-[#1e3a5f] hover:border-[#3b82f6] hover:text-[#3b82f6]'
            }`}
          >
            {page}
          </button>
        ))}
        
        <button
          onClick={() => onPageChange(current + 1)}
          disabled={current === totalPages}
          className="px-2 py-1 text-xs text-[#8b9bb4] border border-[#1e3a5f] rounded hover:border-[#3b82f6] hover:text-[#3b82f6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          下一页
        </button>
      </div>
    </div>
  );
}