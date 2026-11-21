import React from 'react';
import Link from 'next/link';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[65vh] text-center">
      <div className="card-comic p-8 max-w-md w-full bg-[var(--surface-card)] flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl border-2 border-[#111113] bg-[#FFE600] text-[#111113] flex items-center justify-center font-comic font-black text-2xl shadow-comic-sm">
          404
        </div>
        <h2 className="font-black text-lg uppercase text-[var(--ink-primary)]">
          Không Tìm Thấy Trang
        </h2>
        <p className="text-xs sm:text-sm font-medium text-[var(--ink-secondary)]">
          Nội dung hoặc audio bạn đang tìm kiếm không tồn tại hoặc đã bị di chuyển.
        </p>
        <Link
          href="/home"
          className="btn-comic btn-comic-primary text-xs py-2.5 px-5 font-bold mt-2"
        >
          <Home className="w-4 h-4" strokeWidth={2.25} />
          <span>Về Trang Chủ</span>
        </Link>
      </div>
    </div>
  );
}
