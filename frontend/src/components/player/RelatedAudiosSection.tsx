'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eye, Plus, Sparkles } from 'lucide-react';
import { useAudios } from '@/hooks/useAudio';
import {
  filterRelatedAudios,
  getRelatedAudios,
  RelatedFilterMode,
} from '@/lib/relatedAudios';
import { AudioItem } from '@/types';

export const RELATED_BATCH_SIZE = 10;

interface RelatedAudiosSectionProps {
  currentAudio: AudioItem;
}

const FILTER_OPTIONS: Array<{ mode: RelatedFilterMode; label: string }> = [
  { mode: 'all', label: 'Tất cả' },
  { mode: 'category', label: 'Cùng thể loại' },
  { mode: 'tag', label: 'Cùng thẻ' },
  { mode: 'author', label: 'Cùng tác giả' },
  { mode: 'title', label: 'Cùng tên' },
];

export const RelatedAudiosSection: React.FC<RelatedAudiosSectionProps> = ({ currentAudio }) => {
  const navigate = useNavigate();
  const sectionRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const [isNearViewport, setIsNearViewport] = useState<boolean>(
    () => typeof IntersectionObserver === 'undefined'
  );
  const [activeFilter, setActiveFilter] = useState<RelatedFilterMode>('all');
  const [visibleCount, setVisibleCount] = useState<number>(RELATED_BATCH_SIZE);

  useEffect(() => {
    if (isNearViewport || typeof IntersectionObserver === 'undefined') return;
    const target = triggerRef.current;
    if (!target) {
      setIsNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px 0px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isNearViewport]);

  const { data: audios = [] } = useAudios(
    { page: 1, limit: 60 },
    { enabled: isNearViewport }
  );

  const allMatches = useMemo(
    () => getRelatedAudios(currentAudio, audios),
    [currentAudio, audios]
  );

  const countsByMode = useMemo(() => {
    const counts: Record<RelatedFilterMode, number> = {
      all: allMatches.length,
      category: 0,
      tag: 0,
      author: 0,
      title: 0,
    };
    for (const match of allMatches) {
      if (match.reasons.includes('category')) counts.category += 1;
      if (match.reasons.includes('tag')) counts.tag += 1;
      if (match.reasons.includes('author')) counts.author += 1;
      if (match.reasons.includes('title')) counts.title += 1;
    }
    return counts;
  }, [allMatches]);

  const filteredMatches = useMemo(
    () => filterRelatedAudios(allMatches, activeFilter),
    [allMatches, activeFilter]
  );

  useEffect(() => {
    setActiveFilter('all');
    setVisibleCount(RELATED_BATCH_SIZE);
    if (scrollerRef.current) {
      try {
        scrollerRef.current.scrollLeft = 0;
      } catch {
        // Ignore non-writable scrollLeft mocks in tests
      }
    }
  }, [currentAudio.id]);

  useEffect(() => {
    setVisibleCount(RELATED_BATCH_SIZE);
    if (scrollerRef.current) {
      try {
        scrollerRef.current.scrollLeft = 0;
      } catch {
        // Ignore non-writable scrollLeft mocks in tests
      }
    }
  }, [activeFilter]);

  if (!isNearViewport) {
    return <div ref={triggerRef} className="h-4 w-full" aria-hidden="true" />;
  }

  if (allMatches.length === 0) {
    return null;
  }

  const visibleMatches = filteredMatches.slice(0, visibleCount);
  const remainingCount = Math.max(0, filteredMatches.length - visibleCount);

  const loadMoreBatch = () => {
    setVisibleCount((prev) =>
      prev < filteredMatches.length
        ? Math.min(filteredMatches.length, prev + RELATED_BATCH_SIZE)
        : prev
    );
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 160 && remainingCount > 0) {
      loadMoreBatch();
    }
  };

  const handleScrollByDirection = (direction: 'left' | 'right') => {
    const el = scrollerRef.current;
    if (!el) {
      if (direction === 'right' && remainingCount > 0) loadMoreBatch();
      return;
    }
    const delta = direction === 'right' ? 420 : -420;
    if (typeof el.scrollBy === 'function') {
      el.scrollBy({ left: delta, behavior: 'smooth' });
    } else {
      el.scrollLeft += delta;
    }
    if (
      direction === 'right' &&
      remainingCount > 0 &&
      el.scrollLeft + el.clientWidth >= el.scrollWidth - 460
    ) {
      loadMoreBatch();
    }
  };

  const handleSelectRelated = (itemId: number | string) => {
    navigate(`/player/${itemId}`);
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <section
      ref={sectionRef}
      aria-label="Audio liên quan"
      data-testid="related-audios-section"
      className="card-comic p-4 md:p-5 flex flex-col gap-3 fade-in-comic"
    >
      {/* Header row with title, count & desktop horizontal scroll buttons */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-[#8338EC] shrink-0" strokeWidth={2.5} />
          <h2 className="font-comic font-extrabold text-sm sm:text-base uppercase text-[var(--ink-primary)] tracking-tight truncate">
            Audio Liên Quan
          </h2>
          <span className="badge-comic badge-comic-yellow text-[10px] font-black shrink-0">
            {filteredMatches.length} bộ
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleScrollByDirection('left')}
            className="w-8 h-8 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-card)] text-[var(--ink-primary)] shadow-comic-sm flex items-center justify-center hover:bg-[#FFE600] hover:text-[#111113] active:scale-95 transition-all cursor-pointer"
            aria-label="Cuộn danh sách audio liên quan sang trái"
            title="Cuộn sang trái"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => handleScrollByDirection('right')}
            className="w-8 h-8 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-card)] text-[var(--ink-primary)] shadow-comic-sm flex items-center justify-center hover:bg-[#FFE600] hover:text-[#111113] active:scale-95 transition-all cursor-pointer"
            aria-label="Cuộn danh sách audio liên quan sang phải"
            title="Cuộn sang phải"
          >
            <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div
        role="tablist"
        aria-label="Lọc audio liên quan"
        className="flex items-center gap-1.5 overflow-x-auto flex-nowrap pb-1 no-scrollbar"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {FILTER_OPTIONS.filter((opt) => opt.mode === 'all' || countsByMode[opt.mode] > 0).map(
          (opt) => {
            const isActive = activeFilter === opt.mode;
            return (
              <button
                key={opt.mode}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveFilter(opt.mode)}
                className={`px-2.5 py-1 rounded-lg border-2 text-[11px] font-extrabold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#FFE600] text-[#111113] border-[#111113] shadow-comic-sm'
                    : 'bg-[var(--surface-elevated)] text-[var(--ink-secondary)] border-[var(--border-ink)] hover:bg-[var(--surface-muted)]'
                }`}
              >
                {opt.label} ({countsByMode[opt.mode]})
              </button>
            );
          }
        )}
      </div>

      {/* Horizontal Batch-10 Scroller */}
      <div
        ref={scrollerRef}
        data-testid="related-audios-scroller"
        onScroll={handleScroll}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        className="flex overflow-x-auto gap-3.5 py-1 px-0.5 pb-2 no-scrollbar flex-nowrap"
      >
        {visibleMatches.map((match) => {
          const item = match.audio;
          const badgeClass =
            match.primaryLabel === 'Cùng bộ' || match.primaryLabel === 'Cùng tác giả'
              ? 'badge-comic-purple'
              : 'badge-comic-yellow';

          return (
            <div
              key={item.id}
              data-testid="related-audio-card"
              role="button"
              tabIndex={0}
              onClick={() => handleSelectRelated(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectRelated(item.id);
                }
              }}
              className="w-44 sm:w-48 shrink-0 card-comic p-2.5 flex flex-col gap-2 card-comic-interactive cursor-pointer group bg-[var(--surface-card)]"
            >
              <div className="relative w-full aspect-[16/10] rounded-lg border-2 border-[var(--border-ink)] overflow-hidden bg-[#111113]">
                <img
                  src={item.thumbnailUrl || '/wavelink-icon.png'}
                  alt={item.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

                <span className="absolute top-1 left-1 badge-comic badge-comic-purple text-[8px] py-0 px-1 font-black flex items-center gap-0.5">
                  <Eye className="w-2.5 h-2.5" strokeWidth={2.5} />
                  {(item.viewCount || 0).toLocaleString('vi-VN')}
                </span>

                <span className="absolute top-1 right-1 badge-comic badge-comic-yellow text-[8px] py-0 px-1 font-black text-[#111113]">
                  {item.totalEpisodes || item.episodes?.length || 1} TẬP
                </span>

                <span className="absolute bottom-1 left-1 right-1 badge-comic badge-comic-blue text-[8px] py-0 px-1 truncate font-bold text-center justify-center">
                  {item.categoryName || 'Chung'}
                </span>
              </div>

              <div className="flex flex-col flex-1 justify-between gap-1.5 min-w-0">
                <div className="flex flex-col gap-0.5">
                  <h3 className="font-extrabold text-xs text-[var(--ink-primary)] line-clamp-2 leading-snug group-hover:text-[#3A86FF] transition-colors">
                    {item.title}
                  </h3>
                  <span className="text-[11px] font-semibold text-[var(--ink-muted)] truncate">
                    {item.author || item.channel || 'Chưa rõ'}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-[var(--border-ink)]/15">
                  <span className={`badge-comic ${badgeClass} text-[9px] py-0 px-1.5 font-black`}>
                    {match.primaryLabel}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {remainingCount > 0 && (
          <button
            type="button"
            onClick={loadMoreBatch}
            className="w-40 shrink-0 card-comic p-3 flex flex-col items-center justify-center gap-2 text-center hover:bg-[#FFE600] hover:text-[#111113] transition-colors cursor-pointer"
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
            <span className="font-comic font-extrabold text-xs uppercase">
              Tải thêm 10 audio ({remainingCount} còn lại)
            </span>
          </button>
        )}
      </div>
    </section>
  );
};
