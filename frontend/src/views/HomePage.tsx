'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Flame,
  Eye,
  ListMusic,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Plus,
  Tag,
  X,
  XCircle,
  LayoutGrid,
  Sparkles,
  Inbox,
  History,
  Layers,
  Clock,
  Hash,
  Mic2,
} from 'lucide-react';
import { useStats } from '@/hooks/useStats';
import { useAudios } from '@/hooks/useAudio';
import { useRecentHistory } from '@/hooks/useHistory';
import { useCategories } from '@/hooks/useCategories';
import { useTags } from '@/hooks/useTags';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { usePlayerStore } from '@/stores/playerStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/stores/authStore';
import { HomeSkeleton } from '@/components/common/Skeletons';
import { toast } from '@/components/ui/Toast';
import { formatTime, getOptimizedThumbnailUrl, handleImageFallback } from '@/lib/utils';
import { getAudioListMeta } from '@/services/audioService';
import { groupAudiosIntoSeries, groupTopAuthors } from '@/lib/seriesGrouping';
import { AudioItem, Category, SystemStats } from '@/types';

const GREETING_DISMISSED_SESSION_KEY = 'wavelink_hide_greeting_banner';
const SERIES_BATCH_SIZE = 10;
const HOME_AUDIO_BATCH_STEP = 36;

export interface HomePageProps {
  initialAudios?: AudioItem[];
  initialCatalogAudios?: AudioItem[];
  initialCategories?: Category[];
  initialStats?: SystemStats | null;
}

export const HomePage: React.FC<HomePageProps> = ({
  initialAudios,
  initialCatalogAudios,
  initialCategories,
  initialStats,
}) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { currentAudio: playingAudio, isPlaying, play, togglePlay } = usePlayerStore(
    useShallow((s) => ({
      currentAudio: s.currentAudio,
      isPlaying: s.isPlaying,
      play: s.play,
      togglePlay: s.togglePlay,
    }))
  );

  const [homeTab, setHomeTab] = useState<'latest' | 'popular'>('latest');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [audioBatchLimit, setAudioBatchLimit] = useState<number>(HOME_AUDIO_BATCH_STEP);

  useEffect(() => {
    setAudioBatchLimit(HOME_AUDIO_BATCH_STEP);
  }, [homeTab, selectedCategory]);
  const isDefaultHomeQuery = selectedCategory === null && homeTab === 'latest';
  const { data: stats, isLoading: statsLoading } = useStats({ initialData: initialStats });
  const {
    data: audios = [],
    isLoading: audiosLoading,
    isFetching: audiosFetching,
  } = useAudios(
    {
      page: 1,
      limit: audioBatchLimit,
      ...(selectedCategory !== null ? { categoryId: selectedCategory } : {}),
      ...(homeTab === 'popular' ? { sort: 'popular' } : {}),
    },
    {
      initialData:
        isDefaultHomeQuery && audioBatchLimit === HOME_AUDIO_BATCH_STEP ? initialAudios : undefined,
    }
  );
  const { data: catalogAudios = [] } = useAudios(
    {
      all: true,
      fields: 'catalog',
    },
    {
      initialData: initialCatalogAudios,
    }
  );
  const { data: history = [] } = useRecentHistory();
  const { data: categories = [] } = useCategories(false, { initialData: initialCategories });
  const { data: tags = [] } = useTags();
  const [heroIndex, setHeroIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isGreetingHidden, setIsGreetingHidden] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(GREETING_DISMISSED_SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [visibleSeriesCount, setVisibleSeriesCount] = useState<number>(SERIES_BATCH_SIZE);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const handleDismissGreeting = () => {
    setIsGreetingHidden(true);
    try {
      window.sessionStorage.setItem(GREETING_DISMISSED_SESSION_KEY, 'true');
    } catch {
      // ignore storage errors
    }
  };

  const userName = user?.username || (user?.isGuest ? 'Khách Nghe Thử' : 'Độc Giả');
  const userRole = user?.role || 'GUEST';

  // Top 3 phổ biến nhất: sắp xếp hoàn toàn theo lượt xem (viewCount giảm dần) trên toàn catalog
  const top3Audios = useMemo(() => {
    const src = catalogAudios.length > 0 ? catalogAudios : audios;
    if (!src || src.length === 0) return [];
    return [...src]
      .sort(
        (a, b) =>
          (b.viewCount || 0) - (a.viewCount || 0) ||
          (b.totalDurationSeconds || 0) - (a.totalDurationSeconds || 0)
      )
      .slice(0, 3);
  }, [catalogAudios, audios]);

  useEffect(() => {
    if (heroIndex >= top3Audios.length && top3Audios.length > 0) {
      setHeroIndex(0);
    }
  }, [top3Audios.length, heroIndex]);

  useEffect(() => {
    if (top3Audios.length <= 1 || isHovered) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setHeroIndex((prev) => (prev + 1) % top3Audios.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [top3Audios.length, isHovered]);

  const displayAudios = useMemo(() => {
    let list = [...audios];
    if (selectedCategory !== null) {
      list = list.filter((a) => a.categoryId === selectedCategory);
    }
    if (homeTab === 'popular') {
      list.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
    } else {
      list.sort((a, b) => Number(b.id) - Number(a.id));
    }
    return list;
  }, [audios, selectedCategory, homeTab]);

  const audiosMeta = getAudioListMeta(audios);
  const totalAvailableAudios =
    audiosMeta?.total ??
    (selectedCategory === null
      ? Math.max(stats?.totalAudios ?? 0, catalogAudios.length)
      : audios.length);
  const hasMoreAudios =
    !audiosLoading &&
    audios.length >= audioBatchLimit &&
    (totalAvailableAudios > audios.length || totalAvailableAudios === 0);

  const loadMoreAudios = () => {
    if (audiosFetching || !hasMoreAudios) return;
    setAudioBatchLimit((prev) => prev + HOME_AUDIO_BATCH_STEP);
  };

  const handleAudiosHorizontalScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!hasMoreAudios || audiosFetching) return;
    const el = e.currentTarget;
    if (el.scrollLeft <= 0) return;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 200) {
      loadMoreAudios();
    }
  };

  // Tự động gộp tất cả các bộ truyện nhiều phần có tên (>10 ký tự có nghĩa) & tác giả trùng nhau trên toàn bộ catalog
  const seriesSourceAudios = catalogAudios.length > 0 ? catalogAudios : audios;
  const groupedSeries = useMemo(() => groupAudiosIntoSeries(seriesSourceAudios), [seriesSourceAudios]);

  useEffect(() => {
    setVisibleSeriesCount(SERIES_BATCH_SIZE);
  }, [groupedSeries.length]);

  const visibleSeries = useMemo(
    () => groupedSeries.slice(0, visibleSeriesCount),
    [groupedSeries, visibleSeriesCount]
  );

  const handleSeriesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollLeft <= 0) return;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 160) {
      setVisibleSeriesCount((prev) =>
        prev < groupedSeries.length
          ? Math.min(groupedSeries.length, prev + SERIES_BATCH_SIZE)
          : prev
      );
    }
  };

  // Cày Xuyên Đêm: chọn các bộ có tổng thời lượng dài nhất, hiển thị hàng ngang lướt qua
  const marathonPicks = useMemo(() => {
    if (!seriesSourceAudios || seriesSourceAudios.length === 0) return [];
    const leadHeroId = seriesSourceAudios.length > 3 ? top3Audios[0]?.id : undefined;
    return [...seriesSourceAudios]
      .filter((a) => (a.totalDurationSeconds || 0) > 0 && a.id !== leadHeroId)
      .sort((a, b) => (b.totalDurationSeconds || 0) - (a.totalDurationSeconds || 0))
      .slice(0, 12);
  }, [seriesSourceAudios, top3Audios]);

  // Tổng hợp Tag phổ biến từ hook tags + tags thực tế gắn trong danh sách truyện
  const discoveryTags = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    const pushTag = (raw: string) => {
      const cleaned = raw.replace(/^#/, '').trim();
      if (!cleaned) return;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push(cleaned);
    };

    tags.forEach((t) => pushTag(t.name));
    audios.forEach((a) => (a.tags || []).forEach(pushTag));
    return list.slice(0, 20);
  }, [tags, audios]);

  const topAuthors = useMemo(() => groupTopAuthors(seriesSourceAudios, 15), [seriesSourceAudios]);

  const isWaitingForInitialData = audios.length === 0 && (audiosLoading || statsLoading);
  const showSkeletonFallback = useDelayedFallback(isWaitingForInitialData, 180);

  if (showSkeletonFallback) {
    return <HomeSkeleton />;
  }

  // While within the <180ms grace window without cache, render a lightweight layout shell without pulsing skeleton
  if (isWaitingForInitialData) {
    return <div className="w-full max-w-6xl mx-auto px-4 md:px-6 min-h-[60vh]" />;
  }

  const selectedCategoryName = categories.find((c) => c.id === selectedCategory)?.name;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-6 flex flex-col gap-6 pb-36 md:pb-28 pt-2 fade-in-comic">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="font-comic font-black text-base sm:text-xl text-[var(--ink-primary)] tracking-tight leading-snug">
          WaveLink — Nghe Audio, Sách Nói &amp; Podcast YouTube Tắt Màn Hình
        </h1>
      </div>

      {/* 1. Section Lời Chào (Có nút X để tắt trong phiên mở web) */}
      {!isGreetingHidden && (
        <div className="manga-bubble flex items-center justify-between gap-3 relative">
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-black uppercase text-[var(--ink-secondary)] tracking-wider">
              Xin chào, <strong className="text-[var(--ink-primary)]">{userName}</strong>!
            </span>
            <span className="text-sm sm:text-base font-extrabold text-[var(--ink-primary)] leading-snug mt-0.5">
              Hôm nay bạn muốn cày bộ truyện hay podcast nào?
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {stats && (
              <span className="hidden sm:inline-flex badge-comic badge-comic-white text-[10px] py-1 px-2">
                {stats.totalAudios || audios.length} Audio
              </span>
            )}
            <span
              className={`badge-comic ${
                userRole === 'ADMIN'
                  ? 'badge-comic-red'
                  : userRole === 'VIP'
                    ? 'badge-comic-purple'
                    : 'badge-comic-yellow'
              } text-[10px]`}
            >
              {userRole}
            </span>
            <button
              type="button"
              onClick={handleDismissGreeting}
              aria-label="Đóng lời chào"
              title="Đóng lời chào trong phiên này"
              className="w-7 h-7 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-card)] text-[var(--ink-primary)] hover:bg-[#E63946] hover:text-white flex items-center justify-center shadow-comic-sm transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.75} />
            </button>
          </div>
        </div>
      )}

      {/* 2. TOP 3 PHỔ BIẾN NHẤT (Sắp xếp theo lượt xem, không theo lượt tải mới nhất) */}
      <div className="w-full">
        {top3Audios.length > 0 ? (
          <section
            className="flex flex-col gap-2.5"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-[#E63946]" strokeWidth={2.5} />
                <h2 className="font-comic font-extrabold text-sm uppercase text-[var(--ink-primary)] tracking-tight">
                  Top {top3Audios.length} Phổ Biến Nhất
                </h2>
              </div>

              <div className="flex items-center gap-1.5">
                {top3Audios.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setHeroIndex((prev) => (prev - 1 + top3Audios.length) % top3Audios.length)
                    }
                    className="w-9 h-9 rounded-lg bg-[var(--surface-card)] border-2 border-[var(--border-ink)] shadow-comic-sm flex items-center justify-center text-[var(--ink-primary)] hover:bg-[#FFE600] hover:text-[#111113] active:scale-95 transition-transform cursor-pointer"
                    aria-label="Truyện trước"
                  >
                    <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
                  </button>
                )}
                {top3Audios.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setHeroIndex(idx)}
                    className="min-w-[28px] min-h-[28px] flex items-center justify-center cursor-pointer"
                    aria-label={`Chuyển tới truyện số ${idx + 1}`}
                  >
                    <span
                      className={`block h-2.5 w-4 rounded-full border-2 border-[#111113] transition-transform duration-200 ${
                        heroIndex === idx
                          ? 'scale-x-125 bg-[#FFE600]'
                          : 'scale-x-75 bg-[var(--surface-muted)] opacity-75 hover:opacity-100'
                      }`}
                    />
                  </button>
                ))}
                {top3Audios.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setHeroIndex((prev) => (prev + 1) % top3Audios.length)}
                    className="w-9 h-9 rounded-lg bg-[var(--surface-card)] border-2 border-[var(--border-ink)] shadow-comic-sm flex items-center justify-center text-[var(--ink-primary)] hover:bg-[#FFE600] hover:text-[#111113] active:scale-95 transition-transform cursor-pointer"
                    aria-label="Truyện kế tiếp"
                  >
                    <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>

            <div className="card-comic p-0 overflow-hidden relative">
              <div
                className="flex transition-transform duration-700 ease-in-out"
                style={{ transform: `translateX(-${heroIndex * 100}%)` }}
              >
                {top3Audios.map((audio, idx) => {
                  const isThisPlaying = Boolean(
                    isPlaying && playingAudio && String(playingAudio.id) === String(audio.id)
                  );
                  const currentStoreEp = usePlayerStore.getState().currentEpisode;
                  const activeEp =
                    isThisPlaying && currentStoreEp
                      ? currentStoreEp
                      : audio.episodes?.find(
                          (e) =>
                            (audio.currentEpisodeId && e.id === audio.currentEpisodeId) ||
                            (audio.currentEpisodeNumber && e.episodeNumber === audio.currentEpisodeNumber)
                        ) ||
                        audio.episodes?.[0] || {
                          id: 1,
                          episodeNumber: 1,
                          title: 'Tập 1',
                          startSeconds: 0,
                          endSeconds: 14400,
                          duration: 14400,
                        };

                  const episodeDuration =
                    activeEp.duration || activeEp.endSeconds - activeEp.startSeconds || 14400;
                  const currentPosition = isThisPlaying
                    ? usePlayerStore.getState().currentTime
                    : audio.lastPositionSeconds || 0;
                  const progressPercent =
                    audio.progressPercent ||
                    Math.min(100, Math.round((currentPosition / episodeDuration) * 100)) ||
                    0;

                  const formattedPos = formatTime(currentPosition);
                  const formattedEpDuration = formatTime(episodeDuration);

                  const handlePlay = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (playingAudio && String(playingAudio.id) === String(audio.id)) {
                      togglePlay();
                    } else {
                      const isVipOrAdmin =
                        user?.role === 'VIP' || user?.role === 'ADMIN' || user?.membership === 'VIP';
                      const isVipAudio = Boolean(audio.isVIPOnly || audio.isVipOnly);
                      const totalEps = audio.totalEpisodes || audio.episodes?.length || 1;
                      if (
                        isVipAudio &&
                        !isVipOrAdmin &&
                        (totalEps <= 1 || (activeEp && activeEp.episodeNumber > 1))
                      ) {
                        toast.error(
                          'Nội dung này độc quyền dành riêng cho thành viên VIP. Vui lòng nâng cấp gói!'
                        );
                        navigate('/membership');
                        return;
                      }
                      play(audio, activeEp, currentPosition);
                    }
                  };

                  return (
                    <div key={audio.id} className="w-full shrink-0 p-3.5 sm:p-4 flex flex-col gap-3">
                      <Link
                        to={`/player/${audio.id}`}
                        className="relative block w-full aspect-[16/9] sm:aspect-[21/9] rounded-xl border-2 border-[var(--border-ink)] overflow-hidden bg-[#111113] shadow-comic-sm cursor-pointer group"
                        aria-label={`Nghe ${audio.title}`}
                      >
                        <img
                          src={getOptimizedThumbnailUrl(audio.thumbnailUrl, 'hero')}
                          alt={audio.title}
                          width={1280}
                          height={720}
                          loading={idx === 0 ? 'eager' : 'lazy'}
                          decoding={idx === 0 ? 'sync' : 'async'}
                          onError={(e) => handleImageFallback(e, audio.thumbnailUrl)}
                          {...(idx === 0 ? ({ fetchpriority: 'high' } as Record<string, string>) : {})}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                        <span
                          className={`absolute top-2 left-2 badge-comic ${
                            idx === 0
                              ? 'badge-comic-yellow'
                              : idx === 1
                                ? 'badge-comic-blue'
                                : 'badge-comic-red'
                          } text-[10px] py-0.5 px-2 font-black`}
                        >
                          TOP #{idx + 1}
                        </span>

                        <div className="absolute top-2 right-2 flex items-center gap-1.5">
                          <span className="badge-comic badge-comic-purple text-[9px] py-0.5 px-2 font-bold flex items-center gap-1">
                            <Eye className="w-2.5 h-2.5" strokeWidth={2.5} />
                            {(audio.viewCount || 0).toLocaleString()} lượt nghe
                          </span>
                          {(audio.isVIPOnly || audio.isVipOnly) && (
                            <span className="badge-comic badge-comic-red text-[9px] py-0.5 px-2 font-bold">
                              VIP
                            </span>
                          )}
                        </div>

                        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
                          <span className="badge-comic badge-comic-blue text-[9px] py-0.5 px-2 font-bold">
                            {audio.categoryName || 'Chung'}
                          </span>
                          <span className="badge-comic badge-comic-white text-[9px] py-0.5 px-2 font-black">
                            TẬP {String(activeEp?.episodeNumber || 1).padStart(2, '0')}
                          </span>
                        </div>
                      </Link>

                      <div className="flex flex-col gap-1.5 min-w-0">
                        <Link
                          to={`/player/${audio.id}`}
                          className="group"
                        >
                          <h3 className="font-extrabold text-sm sm:text-base text-[var(--ink-primary)] line-clamp-2 group-hover:text-[#3A86FF] transition-colors leading-snug">
                            {audio.title}
                          </h3>
                        </Link>

                        <div className="flex items-center justify-between gap-2 text-xs text-[var(--ink-secondary)]">
                          <span className="font-semibold truncate">
                            Tác giả: {audio.author || 'Đang cập nhật'}
                          </span>
                          <div className="flex items-center gap-2 font-mono font-bold shrink-0">
                            <span>{progressPercent > 0 ? formattedPos : 'Khởi đầu'}</span>
                            {progressPercent > 0 && (
                              <span className="badge-comic badge-comic-yellow text-[9px] py-0 px-1.5 font-mono">
                                TẬP {String(activeEp.episodeNumber || 1).padStart(2, '0')}: {progressPercent}%
                              </span>
                            )}
                            <span className="text-[var(--ink-primary)] font-extrabold">
                              {progressPercent > 0 ? formattedEpDuration : audio.formattedDuration || '04:00:00'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {progressPercent > 0 && (
                        <div className="w-full bg-[var(--surface-muted)] h-2.5 rounded-full border-2 border-[var(--border-ink)] overflow-hidden relative">
                          <div
                            className="h-full bg-[#FFE600] transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-2 border-t-2 border-[var(--border-ink)]/30">
                        <Link
                          to={`/player/${audio.id}`}
                          aria-label={`Danh sách tập - ${audio.title}`}
                          className="btn-comic text-xs h-9 px-3 whitespace-nowrap"
                        >
                          <ListMusic className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />
                          <span>Danh sách tập</span>
                        </Link>
                        <button
                          type="button"
                          onClick={handlePlay}
                          className={`btn-comic ${
                            isThisPlaying ? 'btn-comic-yellow' : 'btn-comic-primary'
                          } text-xs h-9 px-4 font-black whitespace-nowrap`}
                        >
                          {isThisPlaying ? (
                            <Pause className="w-4 h-4 fill-current shrink-0" strokeWidth={2.5} />
                          ) : (
                            <Play className="w-4 h-4 fill-current shrink-0" strokeWidth={2.5} />
                          )}
                          <span>
                            {isThisPlaying
                              ? 'Tạm Dừng'
                              : progressPercent > 0
                                ? 'Cày Tiếp'
                                : 'Nghe Ngay'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          <section className="card-comic p-6 text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl border-2 border-[#111113] bg-[#FFE600] text-[#111113] flex items-center justify-center shadow-comic-sm">
              <Headphones className="w-7 h-7" strokeWidth={2.25} />
            </div>
            <h3 className="font-extrabold text-base text-[var(--ink-primary)] uppercase">
              Chưa có truyện trong thư viện
            </h3>
            <p className="text-xs font-medium text-[var(--ink-secondary)] max-w-sm">
              Nhập liên kết YouTube để tạo audio cá nhân hóa đầu tiên và nghe chạy ngầm khi tắt màn hình.
            </p>
            <button
              type="button"
              onClick={() => navigate('/upload')}
              className="btn-comic btn-comic-yellow text-xs py-2 px-4"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              <span>Nhập link YouTube</span>
            </button>
          </section>
        )}
      </div>

      {/* 3. KHÁM PHÁ THỂ LOẠI */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Tag className="w-4 h-4 text-[#3A86FF]" strokeWidth={2.5} />
            <h2 className="font-comic font-extrabold text-sm uppercase text-[var(--ink-primary)] tracking-tight">
              Khám Phá Thể Loại
            </h2>
          </div>
          {selectedCategory !== null && (
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className="text-xs font-bold text-[#E63946] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" /> Xóa lọc
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar flex-nowrap lg:flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={`btn-comic text-xs py-1.5 px-3 whitespace-nowrap shrink-0 ${
              selectedCategory === null ? 'btn-comic-yellow' : ''
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" strokeWidth={2.25} />
            <span>Tất cả</span>
          </button>

          {categories.map((c) => {
            const isSelected = selectedCategory === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(isSelected ? null : c.id)}
                className={`btn-comic text-xs py-1.5 px-3 whitespace-nowrap shrink-0 ${
                  isSelected ? 'btn-comic-yellow' : ''
                }`}
              >
                <Tag className="w-3.5 h-3.5" strokeWidth={2.25} />
                <span>{c.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. SECTION MỚI NHẤT / PHỔ BIẾN */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 bg-[var(--surface-muted)] p-1 rounded-xl border-2 border-[var(--border-ink)] shadow-comic-sm">
            <button
              type="button"
              onClick={() => setHomeTab('latest')}
              className={`btn-comic text-xs py-1 px-3 font-black ${
                homeTab === 'latest'
                  ? 'btn-comic-yellow'
                  : 'bg-transparent border-transparent shadow-none text-[var(--ink-secondary)] hover:bg-[var(--surface-card)]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span>Mới Cập Nhật</span>
            </button>
            <button
              type="button"
              onClick={() => setHomeTab('popular')}
              className={`btn-comic text-xs py-1 px-3 font-black ${
                homeTab === 'popular'
                  ? 'btn-comic-yellow'
                  : 'bg-transparent border-transparent shadow-none text-[var(--ink-secondary)] hover:bg-[var(--surface-card)]'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-[#E63946]" strokeWidth={2.5} />
              <span>Phổ Biến</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {selectedCategoryName && (
              <span className="badge-comic badge-comic-blue text-[10px] py-0.5 px-2 font-bold">
                {selectedCategoryName}
              </span>
            )}
            <Link
              to="/library"
              aria-label="Xem tất cả audio trong thư viện"
              className="text-xs font-extrabold text-[#3A86FF] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <span>Xem tất cả</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {displayAudios.length === 0 ? (
          <div className="card-comic p-6 text-center flex flex-col items-center gap-2">
            <Inbox className="w-8 h-8 text-[var(--ink-muted)]" strokeWidth={2} />
            <span className="text-xs font-bold text-[var(--ink-secondary)]">
              Không có truyện nào phù hợp với bộ lọc hiện tại.
            </span>
            {selectedCategory !== null && (
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="btn-comic btn-comic-yellow text-xs py-1.5 px-3 mt-1"
              >
                Xem tất cả thể loại
              </button>
            )}
          </div>
        ) : (
          <div
            data-testid="home-audios-scroller"
            onScroll={handleAudiosHorizontalScroll}
            className="flex overflow-x-auto sm:overflow-visible sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 pb-2 no-scrollbar"
          >
            {displayAudios.slice(0, audioBatchLimit).map((audio, index) => (
              <Link
                key={audio.id}
                to={`/player/${audio.id}`}
                className="w-36 sm:w-auto flex flex-col gap-2 shrink-0 cursor-pointer group"
              >
                <div className="card-comic w-full aspect-[3/4] overflow-hidden relative card-comic-interactive">
                  <img
                    src={getOptimizedThumbnailUrl(audio.thumbnailUrl, 'card')}
                    alt={audio.title}
                    width={360}
                    height={480}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => handleImageFallback(e, audio.thumbnailUrl)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                  <span className="absolute top-1.5 left-1.5 badge-comic badge-comic-purple text-[8px] py-0 px-1.5 font-black flex items-center gap-0.5">
                    <Eye className="w-2.5 h-2.5" strokeWidth={2.5} />
                    {(audio.viewCount || 0).toLocaleString()}
                  </span>

                  {homeTab === 'popular' ? (
                    <span
                      className={`absolute top-1.5 right-1.5 badge-comic ${
                        index === 0
                          ? 'badge-comic-yellow'
                          : index === 1
                            ? 'badge-comic-blue'
                            : index === 2
                              ? 'badge-comic-red'
                              : 'badge-comic-white'
                      } text-[8px] py-0 px-1.5 font-black`}
                    >
                      #{index + 1}
                    </span>
                  ) : (
                    <span className="absolute top-1.5 right-1.5 badge-comic badge-comic-yellow text-[8px] py-0 px-1.5 font-black">
                      {audio.totalEpisodes || audio.episodes?.length || 1} TẬP
                    </span>
                  )}

                  <span className="absolute bottom-1.5 left-1.5 right-1.5 badge-comic badge-comic-blue text-[8px] py-0 px-1.5 truncate font-bold text-center justify-center">
                    {audio.categoryName || 'Chung'}
                  </span>
                </div>

                <div className="flex flex-col">
                  <h3 className="font-extrabold text-xs sm:text-[13px] text-[var(--ink-primary)] line-clamp-2 leading-tight group-hover:text-[#3A86FF] transition-colors">
                    {audio.title}
                  </h3>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--ink-muted)] truncate mt-0.5">
                    <span className="truncate">{audio.author || 'Official'}</span>
                    <span className="text-[10px] font-extrabold text-[var(--ink-secondary)] shrink-0 ml-1 flex items-center gap-0.5">
                      <Eye className="w-2.5 h-2.5 text-[#8338EC]" strokeWidth={2.5} />
                      {audio.viewCount || 0}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
        {hasMoreAudios && (
          <div className="hidden sm:flex justify-center pt-1">
            <button
              type="button"
              data-testid="home-show-more-audios-btn"
              onClick={loadMoreAudios}
              disabled={audiosFetching}
              className="btn-comic text-xs py-2 px-5 cursor-pointer"
            >
              <span>{audiosFetching ? 'Đang tải...' : 'Xem thêm'}</span>
            </button>
          </div>
        )}
      </section>

      {/* 5. BỘ TRUYỆN NHIỀU PHẦN (Lấy tất cả bộ truyện cùng tên/tác giả, lướt ngang load 10 thẻ cùng lúc) */}
      {groupedSeries.length > 0 && (
        <section className="flex flex-col gap-3 content-visibility-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#8338EC]" strokeWidth={2.5} />
              <h2 className="font-comic font-extrabold text-sm uppercase text-[var(--ink-primary)] tracking-tight">
                Bộ Truyện Nhiều Phần ({groupedSeries.length})
              </h2>
            </div>
          </div>

          <div
            data-testid="series-horizontal-scroller"
            onScroll={handleSeriesScroll}
            className="flex overflow-x-auto gap-3.5 py-1 px-0.5 pb-2 no-scrollbar flex-nowrap"
          >
            {visibleSeries.map((series) => (
              <Link
                key={series.key}
                to={`/library?search=${encodeURIComponent(series.searchQuery)}`}
                className="w-40 sm:w-44 shrink-0 flex flex-col gap-2 cursor-pointer group"
              >
                <div className="relative pr-1.5 pb-1.5">
                  <div
                    aria-hidden="true"
                    className="absolute top-1.5 left-1.5 right-0 bottom-0 rounded-2xl border-2 border-[var(--border-ink)] bg-[#FFE600]"
                  />
                  <div className="card-comic w-full aspect-[3/4] overflow-hidden relative card-comic-interactive">
                    <img
                      src={getOptimizedThumbnailUrl(series.thumbnailUrl, 'card')}
                      alt={series.seriesTitle}
                      width={360}
                      height={480}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => handleImageFallback(e, series.thumbnailUrl)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                    <span className="absolute top-1.5 left-1.5 badge-comic badge-comic-purple text-[8px] py-0 px-1.5 font-black">
                      {series.partCount} PHẦN
                    </span>

                    <span className="absolute top-1.5 right-1.5 badge-comic badge-comic-yellow text-[8px] py-0 px-1.5 font-black text-[#111113]">
                      {series.totalEpisodes} TẬP
                    </span>

                    <span className="absolute bottom-1.5 left-1.5 right-1.5 badge-comic badge-comic-blue text-[8px] py-0 px-1.5 truncate font-bold text-center justify-center">
                      {series.totalDurationSeconds > 0
                        ? formatTime(series.totalDurationSeconds)
                        : series.categoryName || 'Chung'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col">
                  <h3 className="font-extrabold text-xs sm:text-[13px] text-[var(--ink-primary)] line-clamp-2 leading-tight group-hover:text-[#3A86FF] transition-colors">
                    {series.seriesTitle}
                  </h3>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--ink-muted)] truncate mt-0.5">
                    <span className="truncate">{series.author}</span>
                    <span className="text-[10px] font-extrabold text-[#3A86FF] shrink-0 ml-1 flex items-center">
                      <span>Trọn bộ</span>
                      <ChevronRight className="w-3 h-3" strokeWidth={2.5} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}

            {visibleSeriesCount < groupedSeries.length && (
              <button
                type="button"
                onClick={() =>
                  setVisibleSeriesCount((prev) =>
                    Math.min(groupedSeries.length, prev + SERIES_BATCH_SIZE)
                  )
                }
                className="w-40 shrink-0 card-comic p-3 flex flex-col items-center justify-center gap-2 text-center hover:bg-[#FFE600] hover:text-[#111113] transition-colors cursor-pointer"
              >
                <Plus className="w-6 h-6" strokeWidth={2.5} />
                <span className="font-comic font-extrabold text-xs uppercase">
                  Xem thêm
                </span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* 6. TỪ KHÓA NỔI BẬT */}
      {discoveryTags.length > 0 && (
        <section className="card-comic p-4 flex flex-col gap-3 content-visibility-auto">
          <div className="flex items-center gap-1.5">
            <Hash className="w-4 h-4 text-[#E63946]" strokeWidth={2.5} />
            <h2 className="font-comic font-extrabold text-sm uppercase text-[var(--ink-primary)] tracking-tight">
              Từ Khóa Nổi Bật
            </h2>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto py-1 px-0.5 no-scrollbar flex-nowrap">
            {discoveryTags.map((tag) => (
              <Link
                key={tag}
                to={`/library?search=${encodeURIComponent(tag)}`}
                className="badge-comic badge-comic-white hover:bg-[#FFE600] hover:text-[#111113] transition-colors text-[11px] py-1 px-2.5 shrink-0 cursor-pointer font-bold"
              >
                #{tag}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 7. CÀY XUYÊN ĐÊM (Hiện theo hàng ngang, lướt ngang để xem thêm) */}
      {marathonPicks.length > 0 && (
        <section className="flex flex-col gap-3 content-visibility-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#2A9D8F]" strokeWidth={2.5} />
              <h2 className="font-comic font-extrabold text-sm uppercase text-[var(--ink-primary)] tracking-tight">
                Cày Xuyên Đêm
              </h2>
            </div>
            <Link
              to="/library"
              aria-label="Xem thêm audio dài trong thư viện"
              className="text-xs font-extrabold text-[#3A86FF] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <span>Thư viện</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div
            data-testid="marathon-horizontal-scroller"
            className="flex overflow-x-auto gap-3.5 py-1 px-0.5 pb-2 no-scrollbar flex-nowrap"
          >
            {marathonPicks.map((audio) => (
              <Link
                key={`marathon-${audio.id}`}
                to={`/player/${audio.id}`}
                className="w-40 sm:w-44 shrink-0 flex flex-col gap-2 cursor-pointer group"
              >
                <div className="card-comic w-full aspect-[3/4] overflow-hidden relative card-comic-interactive">
                  <img
                    src={getOptimizedThumbnailUrl(audio.thumbnailUrl, 'card')}
                    alt={audio.title}
                    width={360}
                    height={480}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => handleImageFallback(e, audio.thumbnailUrl)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                  <span className="absolute top-1.5 left-1.5 badge-comic badge-comic-yellow text-[8px] py-0 px-1.5 font-mono font-black text-[#111113] flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" strokeWidth={2.5} />
                    {audio.formattedDuration || formatTime(audio.totalDurationSeconds || 0)}
                  </span>

                  <span className="absolute top-1.5 right-1.5 badge-comic badge-comic-purple text-[8px] py-0 px-1.5 font-black text-white">
                    {audio.totalEpisodes || audio.episodes?.length || 1} TẬP
                  </span>

                  <span className="absolute bottom-1.5 left-1.5 right-1.5 badge-comic badge-comic-blue text-[8px] py-0 px-1.5 truncate font-bold text-center justify-center">
                    {audio.categoryName || 'Chung'}
                  </span>
                </div>

                <div className="flex flex-col">
                  <h3 className="font-extrabold text-xs sm:text-[13px] text-[var(--ink-primary)] line-clamp-2 leading-tight group-hover:text-[#3A86FF] transition-colors">
                    {audio.title}
                  </h3>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--ink-muted)] truncate mt-0.5">
                    <span className="truncate">{audio.author || 'Official'}</span>
                    <span className="text-[10px] font-extrabold text-[var(--ink-secondary)] shrink-0 ml-1 flex items-center gap-0.5">
                      <Eye className="w-2.5 h-2.5 text-[#8338EC]" strokeWidth={2.5} />
                      {(audio.viewCount || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 8. KÊNH & TÁC GIẢ NỔI BẬT (Lướt sang ngang) */}
      {topAuthors.length > 0 && (
        <section className="flex flex-col gap-3 content-visibility-auto">
          <div className="flex items-center gap-1.5">
            <Mic2 className="w-4 h-4 text-[#3A86FF]" strokeWidth={2.5} />
            <h2 className="font-comic font-extrabold text-sm uppercase text-[var(--ink-primary)] tracking-tight">
              Kênh &amp; Tác Giả Nổi Bật
            </h2>
          </div>

          <div
            data-testid="authors-horizontal-scroller"
            className="flex overflow-x-auto gap-3 py-1 px-0.5 pb-2 no-scrollbar flex-nowrap"
          >
            {topAuthors.map((author) => (
              <Link
                key={author.name}
                to={`/library?search=${encodeURIComponent(author.name)}`}
                className="w-56 sm:w-64 shrink-0 card-comic-sm p-3 flex items-center gap-2.5 text-left hover:bg-[var(--surface-accent-soft)] transition-colors cursor-pointer group"
              >
                <img
                  src={getOptimizedThumbnailUrl(author.sampleThumbnail, 'avatar')}
                  alt={author.name}
                  width={44}
                  height={44}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => handleImageFallback(e, author.sampleThumbnail)}
                  className="w-11 h-11 rounded-xl object-cover border-2 border-[var(--border-ink)] shrink-0"
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate group-hover:text-[#3A86FF]">
                    {author.name}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--ink-muted)] truncate mt-0.5">
                    {author.audioCount} bộ • {author.totalEpisodes} tập
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--ink-muted)] shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 9. VỪA CÀY GẦN ĐÂY (Mặc định hiển thị 3 mục gần nhất, có nút Xem tất cả toàn bộ lịch sử) */}
      <section className="flex flex-col gap-3 content-visibility-auto">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <History className="w-4 h-4 text-[#3A86FF]" strokeWidth={2.5} />
            <h2 className="font-comic font-extrabold text-sm uppercase text-[var(--ink-primary)] tracking-tight">
              Vừa Cày Gần Đây
            </h2>
            {history.length > 0 && (
              <span className="badge-comic badge-comic-yellow text-[9px] font-black">
                {history.length} bộ
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {history.length > 3 && (
              <button
                type="button"
                data-testid="home-toggle-all-history-btn"
                onClick={() => setShowAllHistory((prev) => !prev)}
                className="text-xs font-extrabold text-[#8338EC] hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <span>{showAllHistory ? 'Thu gọn' : 'Xem tất cả'}</span>
              </button>
            )}
            <Link
              to="/profile"
              aria-label="Xem hồ sơ và lịch sử nghe"
              className="text-xs font-extrabold text-[#3A86FF] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <span>{history.length > 3 ? 'Hồ sơ' : 'Xem thêm'}</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {history && history.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {(showAllHistory ? history : history.slice(0, 3)).map((item) => (
              <Link
                key={`${item.audioId}-${item.episodeId}`}
                to={`/player/${item.audioId}`}
                className="flex flex-col gap-2 cursor-pointer group"
              >
                <div className="card-comic w-full aspect-[3/4] overflow-hidden relative card-comic-interactive">
                  <img
                    src={getOptimizedThumbnailUrl(item.thumbnailUrl, 'card')}
                    alt={item.title || 'Truyện Audio'}
                    width={360}
                    height={480}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => handleImageFallback(e, item.thumbnailUrl)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                  <span className="absolute top-1.5 left-1.5 badge-comic badge-comic-yellow text-[8px] py-0 px-1.5 font-black text-[#111113]">
                    {item.currentEpisodeTitle || item.episodeTitle || 'Tập 1'}
                  </span>

                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg border-2 border-[#111113] bg-[#1D4ED8] text-white flex items-center justify-center shadow-comic-sm group-hover:scale-105"
                  >
                    <Play className="w-3 h-3 fill-current ml-0.5" strokeWidth={2.5} />
                  </span>

                  <span className="absolute bottom-1.5 left-1.5 right-1.5 badge-comic badge-comic-blue text-[8px] py-0 px-1.5 truncate font-mono font-bold text-center justify-center">
                    Mốc: {item.formattedPosition || '00:00:00'}
                  </span>
                </div>

                <div className="flex flex-col">
                  <h3 className="font-extrabold text-xs sm:text-[13px] text-[var(--ink-primary)] line-clamp-2 leading-tight group-hover:text-[#3A86FF] transition-colors">
                    {item.title || 'Truyện Audio'}
                  </h3>
                  <span className="text-[11px] font-semibold text-[var(--ink-secondary)] truncate mt-0.5">
                    {item.currentEpisodeTitle || item.episodeTitle || 'Tập 1'} · {item.formattedPosition || '00:00:00'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card-comic p-4 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[var(--ink-secondary)]">
              Bạn chưa có lịch sử nghe gần đây. Chọn một bộ truyện bất kỳ để bắt đầu cày!
            </span>
            <Link
              to="/profile"
              className="btn-comic text-xs py-1.5 px-3 shrink-0"
            >
              Vào Hồ Sơ
            </Link>
          </div>
        )}
      </section>
    </div>
  );
};
