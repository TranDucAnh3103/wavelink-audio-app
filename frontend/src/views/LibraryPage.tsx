'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  X,
  UserCheck,
  Heart,
  ListMusic,
  Play,
  Pause,
} from 'lucide-react';
import { useAudios, useToggleFavorite } from '@/hooks/useAudio';
import { useCategories } from '@/hooks/useCategories';
import { useTags } from '@/hooks/useTags';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { usePlayerStore } from '@/stores/playerStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/stores/authStore';
import { LibraryListSkeleton } from '@/components/common/Skeletons';
import { EmptyState } from '@/components/common/EmptyState';
import { toast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';
import { getAudioListMeta } from '@/services/audioService';
import { getOptimizedThumbnailUrl, handleImageFallback } from '@/lib/utils';
import {
  clearLibraryReturnState,
  peekLibraryReturnState,
  saveLibraryReturnState,
} from '@/lib/libraryNavigationState';

export const LibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { currentAudio, isPlaying, play, togglePlay } = usePlayerStore(
    useShallow((s) => ({
      currentAudio: s.currentAudio,
      isPlaying: s.isPlaying,
      play: s.play,
      togglePlay: s.togglePlay,
    }))
  );
  const toggleFavoriteMutation = useToggleFavorite();

  const urlCategory = searchParams.get('categoryId')
    ? Number(searchParams.get('categoryId'))
    : null;
  const urlStatus = searchParams.get('status') || 'all';
  const urlSearch = searchParams.get('search') || '';
  const urlUserId =
    searchParams.get('userId') || searchParams.get('createdBy') || '';

  const [activeCategory, setActiveCategory] = useState<number | null>(urlCategory);
  const [activeStatus, setActiveStatus] = useState<string>(urlStatus);
  const [searchQuery, setSearchQuery] = useState<string>(urlSearch);

  const isComposingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (urlCategory !== activeCategory) setActiveCategory(urlCategory);
  }, [urlCategory, activeCategory]);

  useEffect(() => {
    if (urlSearch !== searchQuery) setSearchQuery(urlSearch);
    // Sync only when URL search param changes externally (e.g., Desktop Header quick search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch]);

  const { data: categories = [] } = useCategories();
  const { data: tags = [] } = useTags();

  const isViewingMyStories = Boolean(
    activeStatus === 'my' ||
      (urlUserId && user?.id && String(user.id) === String(urlUserId))
  );
  const isViewingOtherUserStories = Boolean(
    urlUserId && (!user?.id || String(user.id) !== String(urlUserId))
  );

  const [currentPage, setCurrentPage] = useState<number>(() => {
    const urlPage = Number(searchParams.get('page'));
    if (urlPage >= 1 && Number.isFinite(urlPage)) {
      return Math.floor(urlPage);
    }
    const saved = peekLibraryReturnState();
    if (
      saved &&
      saved.search === urlSearch &&
      saved.categoryId === urlCategory &&
      saved.status === urlStatus &&
      saved.userId === urlUserId &&
      saved.page >= 1
    ) {
      return saved.page;
    }
    return 1;
  });
  const [highlightedAudioId, setHighlightedAudioId] = useState<string | null>(null);
  const pageSize = DEFAULT_PAGE_SIZE;

  const isGuestClientStatusFilter = Boolean(
    (!user || user.isGuest) &&
      (activeStatus === 'listening' || activeStatus === 'completed')
  );

  const { data: audios = [], isLoading } = useAudios({
    search: searchQuery,
    categoryId: activeCategory,
    status: isViewingMyStories
      ? 'my'
      : activeStatus === 'all'
        ? null
        : activeStatus,
    userId: urlUserId || undefined,
    page: isGuestClientStatusFilter ? undefined : currentPage,
    limit: isGuestClientStatusFilter ? undefined : pageSize,
  });

  const serverMeta = getAudioListMeta(audios);

  const uniqueAudios = React.useMemo(() => {
    const seen = new Set<number | string>();
    return audios.filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
  }, [audios]);

  const showSkeletonFallback = useDelayedFallback(isLoading && uniqueAudios.length === 0, 180);

  const prevFiltersRef = useRef({
    search: searchQuery,
    category: activeCategory,
    status: activeStatus,
    userId: urlUserId,
  });

  const syncPageToUrl = (targetPage: number) => {
    const nextParams = new URLSearchParams(searchParams);
    if (targetPage > 1) {
      nextParams.set('page', String(targetPage));
    } else {
      nextParams.delete('page');
    }
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    const urlPage = Number(searchParams.get('page'));
    if (urlPage >= 1 && Number.isFinite(urlPage) && Math.floor(urlPage) !== currentPage) {
      setCurrentPage(Math.floor(urlPage));
    }
    // Only react to external URL page changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const prev = prevFiltersRef.current;
    const filtersChanged =
      prev.search !== searchQuery ||
      prev.category !== activeCategory ||
      prev.status !== activeStatus ||
      prev.userId !== urlUserId;

    if (filtersChanged) {
      prevFiltersRef.current = {
        search: searchQuery,
        category: activeCategory,
        status: activeStatus,
        userId: urlUserId,
      };
      clearLibraryReturnState();
      setCurrentPage(1);
      syncPageToUrl(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, activeCategory, activeStatus, urlUserId]);

  const totalItems = serverMeta ? serverMeta.total : uniqueAudios.length;
  const totalPages = serverMeta
    ? Math.max(1, serverMeta.totalPages)
    : Math.max(1, Math.ceil(uniqueAudios.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  useEffect(() => {
    if (!isLoading && currentPage > totalPages) {
      setCurrentPage(totalPages);
      syncPageToUrl(totalPages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, currentPage, totalPages]);

  const paginatedAudios = React.useMemo(() => {
    if (serverMeta) return uniqueAudios;
    const start = (safeCurrentPage - 1) * pageSize;
    return uniqueAudios.slice(start, start + pageSize);
  }, [serverMeta, uniqueAudios, safeCurrentPage, pageSize]);

  // Khôi phục đúng vị trí cuộn / card audio vừa xem khi quay lại từ PlayerPage
  useEffect(() => {
    if (isLoading || paginatedAudios.length === 0) return;
    const saved = peekLibraryReturnState();
    if (!saved) return;

    const sameFilters =
      saved.search === searchQuery &&
      saved.categoryId === activeCategory &&
      saved.status === activeStatus &&
      saved.userId === urlUserId;

    if (!sameFilters || saved.page !== safeCurrentPage) return;

    clearLibraryReturnState();
    setHighlightedAudioId(saved.audioId);

    const raf = requestAnimationFrame(() => {
      try {
        const cardEl = document.querySelector<HTMLElement>(
          `[data-library-audio-id="${saved.audioId}"]`
        );
        if (cardEl && typeof cardEl.scrollIntoView === 'function') {
          cardEl.scrollIntoView({ block: 'center', behavior: 'auto' });
        } else if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
          window.scrollTo(0, saved.scrollY || 0);
        }
      } catch {
        // Ignore non-implemented scroll mocks in jsdom
      }
    });

    const timer = setTimeout(() => {
      setHighlightedAudioId(null);
    }, 2200);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [isLoading, paginatedAudios, searchQuery, activeCategory, activeStatus, urlUserId, safeCurrentPage]);

  const recordLibraryReturn = (audioId: number | string) => {
    const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
    saveLibraryReturnState({
      page: safeCurrentPage,
      scrollY,
      audioId: String(audioId),
      search: searchQuery,
      categoryId: activeCategory,
      status: activeStatus,
      userId: urlUserId,
      savedAt: Date.now(),
    });
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const nextParams = new URLSearchParams(searchParams);
      if (val) nextParams.set('search', val);
      else nextParams.delete('search');
      setSearchParams(nextParams);
    }, 350);
  };

  const handleCategorySelect = (catId: number | null) => {
    setActiveCategory(catId);
    const nextParams = new URLSearchParams(searchParams);
    if (catId) nextParams.set('categoryId', String(catId));
    else nextParams.delete('categoryId');
    setSearchParams(nextParams);
  };

  const handleStatusSelect = (status: string) => {
    setActiveStatus(status);
    const nextParams = new URLSearchParams(searchParams);
    if (status === 'my') {
      if (user?.id) {
        nextParams.set('userId', String(user.id));
        nextParams.delete('status');
      } else {
        toast.info('Vui lòng đăng nhập để xem truyện của bạn');
        navigate('/login');
        return;
      }
    } else {
      nextParams.delete('userId');
      nextParams.delete('createdBy');
      if (status && status !== 'all') nextParams.set('status', status);
      else nextParams.delete('status');
    }
    setSearchParams(nextParams);
  };

  const handleTagClick = (tagName: string) => {
    handleSearchChange(tagName);
  };

  const handleResetFilters = () => {
    setActiveCategory(null);
    setActiveStatus('all');
    setSearchQuery('');
    setSearchParams({});
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-4 pt-2 fade-in-comic">
      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          {/* 1. Comic Search Bar */}
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none z-10"
              strokeWidth={2.25}
            />
            <input
              id="lib-search-input"
              type="text"
              placeholder="Tìm theo tên truyện, tác giả, video ID, tag..."
              value={searchQuery}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={(e) => {
                isComposingRef.current = false;
                handleSearchChange(e.currentTarget.value);
              }}
              onChange={(e) => {
                if (!isComposingRef.current) {
                  handleSearchChange(e.target.value);
                }
              }}
              className="input-comic pl-10 pr-10 text-xs md:text-sm w-full"
              autoComplete="off"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center border border-[var(--border-ink)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-muted)] z-10 text-[var(--ink-primary)] cursor-pointer"
                title="Xóa tìm kiếm"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            )}
          </div>

          {/* 3. Status Filter Chips */}
          <div className="card-comic-sm p-1 bg-[var(--surface-card)] flex items-center justify-between gap-1 overflow-x-auto no-scrollbar lg:shrink-0">
            <button
              type="button"
              onClick={() => handleStatusSelect('all')}
              className={`status-chip flex-1 lg:flex-initial py-1.5 px-2.5 rounded-lg font-extrabold text-[11px] whitespace-nowrap transition-all cursor-pointer ${
                activeStatus === 'all' && !urlUserId
                  ? 'bg-[#FFE600] text-[#111113] border border-[#111113] shadow-comic-sm'
                  : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-muted)]'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => handleStatusSelect('my')}
              className={`status-chip flex-1 lg:flex-initial py-1.5 px-2.5 rounded-lg font-extrabold text-[11px] whitespace-nowrap transition-all cursor-pointer ${
                isViewingMyStories
                  ? 'bg-[#FFE600] text-[#111113] border border-[#111113] shadow-comic-sm'
                  : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-muted)]'
              }`}
            >
              Của tôi
            </button>
            <button
              type="button"
              onClick={() => handleStatusSelect('listening')}
              className={`status-chip flex-1 lg:flex-initial py-1.5 px-2.5 rounded-lg font-extrabold text-[11px] whitespace-nowrap transition-all cursor-pointer ${
                activeStatus === 'listening'
                  ? 'bg-[#3A86FF] text-white border border-[#111113] shadow-comic-sm'
                  : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-muted)]'
              }`}
            >
              Đang cày
            </button>
            <button
              type="button"
              onClick={() => handleStatusSelect('completed')}
              className={`status-chip flex-1 lg:flex-initial py-1.5 px-2.5 rounded-lg font-extrabold text-[11px] whitespace-nowrap transition-all cursor-pointer ${
                activeStatus === 'completed'
                  ? 'bg-[#2A9D8F] text-white border border-[#111113] shadow-comic-sm'
                  : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-muted)]'
              }`}
            >
              Hoàn thành
            </button>
            <button
              type="button"
              onClick={() => handleStatusSelect('favorite')}
              className={`status-chip flex-1 lg:flex-initial py-1.5 px-2.5 rounded-lg font-extrabold text-[11px] whitespace-nowrap transition-all inline-flex items-center justify-center gap-1 cursor-pointer ${
                activeStatus === 'favorite'
                  ? 'bg-[#E63946] text-white border border-[#111113] shadow-comic-sm'
                  : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-muted)]'
              }`}
            >
              <Heart className="w-3 h-3 fill-current" />
              <span>Yêu thích</span>
            </button>
          </div>
        </div>

        {/* 2. Categories Filter Horizontal Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar md:flex-wrap">
          <button
            type="button"
            onClick={() => handleCategorySelect(null)}
            className={`cat-filter-btn btn-comic text-xs py-1.5 px-3.5 whitespace-nowrap ${
              !activeCategory ? 'btn-comic-yellow' : ''
            }`}
          >
            Tất cả
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleCategorySelect(c.id)}
              className={`cat-filter-btn btn-comic text-xs py-1.5 px-3 whitespace-nowrap ${
                activeCategory === c.id ? 'btn-comic-yellow' : ''
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* User filter banner */}
        {isViewingOtherUserStories && (
          <div className="card-comic-sm p-2.5 bg-[var(--surface-accent-soft)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <UserCheck className="w-4 h-4 text-[#3A86FF] shrink-0" strokeWidth={2.5} />
              <span className="text-xs font-black text-[var(--ink-primary)] truncate">
                Đang lọc kho truyện của độc giả #{urlUserId}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.delete('userId');
                nextParams.delete('createdBy');
                setSearchParams(nextParams);
              }}
              className="text-xs text-[#E63946] font-bold hover:underline px-1.5 shrink-0 cursor-pointer"
            >
              ✕ Xóa bộ lọc
            </button>
          </div>
        )}

        {/* 4. Quick Tag Clouds */}
        {tags && tags.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar md:flex-wrap">
            {tags.slice(0, 12).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTagClick(t.name)}
                className="tag-quick-btn badge-comic badge-comic-white hover:bg-[#FFE600] hover:text-[#111113] transition-colors cursor-pointer text-[10px]"
              >
                #{t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 5. Audio Cards Container */}
      {showSkeletonFallback ? (
        <LibraryListSkeleton />
      ) : isLoading && uniqueAudios.length === 0 ? (
        <div className="min-h-[320px]" />
      ) : uniqueAudios.length === 0 ? (
        <EmptyState
          title="Không tìm thấy Audio phù hợp"
          description="Hãy thử đổi từ khóa tìm kiếm hoặc chọn danh mục thể loại khác."
          actionText="Xóa tất cả bộ lọc"
          onAction={handleResetFilters}
        />
      ) : (
        <div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5"
          id="lib-audio-list"
        >
          {paginatedAudios.map((a) => {
            const isCurrentlyPlaying = Boolean(
              isPlaying && currentAudio && String(currentAudio.id) === String(a.id)
            );
            return (
              <div
                key={a.id}
                data-library-audio-id={String(a.id)}
                className={`card-comic p-3.5 flex flex-col justify-between gap-3 relative group transition-shadow ${
                  highlightedAudioId === String(a.id)
                    ? 'ring-4 ring-[#FFE600] ring-offset-2'
                    : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <Link
                    to={`/player/${a.id}`}
                    className="relative w-20 h-24 rounded-xl border-2 border-[var(--border-ink)] overflow-hidden shrink-0 bg-[#111113] shadow-comic-sm cursor-pointer"
                    onClick={() => recordLibraryReturn(a.id)}
                    aria-label={`Nghe ${a.title}`}
                  >
                    <img
                      src={getOptimizedThumbnailUrl(a.thumbnailUrl, 'card')}
                      alt={a.title}
                      width={160}
                      height={192}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => handleImageFallback(e, a.thumbnailUrl)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {isCurrentlyPlaying && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
                        <div className="comic-eq-container">
                          <div className="comic-eq-bar !bg-white" />
                          <div className="comic-eq-bar !bg-white" />
                          <div className="comic-eq-bar !bg-white" />
                        </div>
                      </div>
                    )}
                    <span className="absolute bottom-1 left-1 badge-comic badge-comic-yellow text-[8px] py-0 px-1 font-black">
                      {a.totalEpisodes || a.episodes?.length || 1} TẬP
                    </span>
                  </Link>

                  <div className="flex flex-col justify-between min-w-0 flex-1 h-24 py-0.5">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="badge-comic badge-comic-blue text-[9px] py-0 px-1.5 font-bold truncate">
                            {a.categoryName || 'Chung'}
                          </span>
                          {(a.isVIPOnly || a.isVipOnly) && (
                            <span className="badge-comic badge-comic-purple text-[8px] py-0 px-1 font-black">
                              VIP
                            </span>
                          )}
                          {a.createdBy && user && a.createdBy === user.id && (
                            <span className="badge-comic badge-comic-yellow text-[8px] py-0 px-1 font-black">
                              CỦA TÔI
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoriteMutation.mutate(a.id);
                          }}
                          className="w-7 h-7 rounded-lg border border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center shadow-comic-sm hover:bg-[var(--surface-muted)] active:translate-y-0.5 shrink-0 cursor-pointer"
                          title="Yêu thích"
                          aria-label={`Yêu thích ${a.title}`}
                        >
                          <Heart
                            className={`w-3.5 h-3.5 ${
                              a.isFavorite
                                ? 'text-[#E63946] fill-[#E63946]'
                                : 'text-[var(--ink-primary)]'
                            }`}
                            strokeWidth={2.5}
                          />
                        </button>
                      </div>
                      <Link
                        to={`/player/${a.id}`}
                        onClick={() => recordLibraryReturn(a.id)}
                        className="mt-1 block truncate"
                      >
                        <h3 className="font-extrabold text-xs md:text-sm text-[var(--ink-primary)] truncate hover:text-[#3A86FF] transition-colors">
                          {a.title}
                        </h3>
                      </Link>
                      <p className="text-[11px] font-semibold text-[var(--ink-muted)] truncate mt-0.5">
                        Tác giả: {a.author || 'Đang cập nhật'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono font-bold text-[var(--ink-secondary)] pt-1 border-t border-[var(--border-ink)]/20">
                      <span className="text-[11px]">{a.formattedDuration || '24h 00m'}</span>
                      <span
                        className={`badge-comic ${
                          (a.progressPercent || 0) >= 100
                            ? 'badge-comic-teal'
                            : (a.progressPercent || 0) > 0
                              ? 'badge-comic-yellow'
                              : 'badge-comic-white'
                        } text-[9px] py-0 px-1.5`}
                      >
                        {(a.progressPercent || 0) >= 100
                          ? 'ĐÃ XONG'
                          : (a.progressPercent || 0) > 0
                            ? `${a.progressPercent}%`
                            : 'CHƯA NGHE'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress bar & Action Bar */}
                <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[var(--border-ink)]/30">
                  <div className="w-full bg-[var(--surface-muted)] h-2 rounded-full border border-[var(--border-ink)] overflow-hidden flex-1">
                    <div
                      className="bg-[#3A86FF] h-full transition-all duration-300"
                      style={{ width: `${a.progressPercent || 0}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                      to={`/player/${a.id}`}
                      onClick={() => recordLibraryReturn(a.id)}
                      className="btn-comic text-[11px] py-1 px-2.5"
                    >
                      <ListMusic className="w-3.5 h-3.5" strokeWidth={2.25} />
                      <span>Tập</span>
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (currentAudio && String(currentAudio.id) === String(a.id)) {
                          togglePlay();
                        } else {
                          const isVipOrAdmin =
                            user?.role === 'VIP' ||
                            user?.role === 'ADMIN' ||
                            user?.membership === 'VIP';
                          const isVipAudio = Boolean(a.isVIPOnly || a.isVipOnly);
                          const totalEps = a.totalEpisodes || a.episodes?.length || 1;
                          if (isVipAudio && !isVipOrAdmin && totalEps <= 1) {
                            toast.error(
                              'Nội dung này độc quyền dành riêng cho thành viên VIP. Vui lòng nâng cấp gói!'
                            );
                            navigate('/membership');
                            return;
                          }
                          play(a);
                        }
                      }}
                      className={`btn-comic ${
                        isCurrentlyPlaying ? 'btn-comic-yellow' : 'btn-comic-primary'
                      } text-[11px] py-1 px-3`}
                    >
                      {isCurrentlyPlaying ? (
                        <Pause className="w-3.5 h-3.5 fill-current" strokeWidth={2.5} />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" strokeWidth={2.5} />
                      )}
                      <span>{isCurrentlyPlaying ? 'Dừng' : 'Cày'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && uniqueAudios.length > 0 && (
        <Pagination
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={(p) => {
            clearLibraryReturnState();
            setCurrentPage(p);
            syncPageToUrl(p);
            try {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } catch {}
          }}
        />
      )}
    </div>
  );
};
