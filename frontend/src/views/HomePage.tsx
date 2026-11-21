'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  XCircle,
  LayoutGrid,
  Sparkles,
  Inbox,
  History,
  Compass,
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
import { useAuthStore } from '@/stores/authStore';
import { HomeSkeleton } from '@/components/common/Skeletons';
import { toast } from '@/components/ui/Toast';
import { formatTime } from '@/lib/utils';
import { groupAudiosIntoSeries, groupTopAuthors } from '@/lib/seriesGrouping';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { currentAudio: playingAudio, isPlaying, play, togglePlay } = usePlayerStore();

  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: audios = [], isLoading: audiosLoading } = useAudios({ pageSize: 50 });
  const { data: history = [] } = useRecentHistory();
  const { data: categories = [] } = useCategories();
  const { data: tags = [] } = useTags();

  const [homeTab, setHomeTab] = useState<'latest' | 'popular'>('latest');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const userName = user?.username || (user?.isGuest ? 'Khách Nghe Thử' : 'Độc Giả');
  const userRole = user?.role || 'GUEST';

  const top3Audios = useMemo(() => {
    if (!audios || audios.length === 0) return [];
    return [...audios]
      .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
      .slice(0, 3);
  }, [audios]);

  useEffect(() => {
    if (heroIndex >= top3Audios.length && top3Audios.length > 0) {
      setHeroIndex(0);
    }
  }, [top3Audios.length, heroIndex]);

  useEffect(() => {
    if (top3Audios.length <= 1 || isHovered) return;
    const interval = setInterval(() => {
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

  // Tự động gộp các bộ truyện nhập làm nhiều tập/phần có tên trùng nhau thành Series Card
  const groupedSeries = useMemo(() => groupAudiosIntoSeries(audios), [audios]);

  // Cày Xuyên Đêm: chọn các bộ có tổng thời lượng dài nhất (loại trừ TOP 1 hero nếu kho đủ phong phú để tránh trùng lặp)
  const marathonPicks = useMemo(() => {
    if (!audios || audios.length === 0) return [];
    const leadHeroId = audios.length > 3 ? top3Audios[0]?.id : undefined;
    return [...audios]
      .filter((a) => (a.totalDurationSeconds || 0) > 0 && a.id !== leadHeroId)
      .sort((a, b) => (b.totalDurationSeconds || 0) - (a.totalDurationSeconds || 0))
      .slice(0, 4);
  }, [audios, top3Audios]);

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
    return list.slice(0, 14);
  }, [tags, audios]);

  const topAuthors = useMemo(() => groupTopAuthors(audios, 6), [audios]);

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
      {/* 1. Greeting Banner */}
      <div className="manga-bubble flex items-center justify-between gap-3">
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
        </div>
      </div>

      {/* 2. HERO + CONTINUE LISTENING (2-column on Desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Top 3 Carousel */}
        {top3Audios.length > 0 ? (
          <section
            className={`${history && history.length > 0 ? 'lg:col-span-7' : 'lg:col-span-8'} flex flex-col gap-2.5`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-[#E63946]" strokeWidth={2.5} />
                <h2 className="font-comic font-extrabold text-sm uppercase text-[var(--ink-primary)] tracking-tight">
                  Top {top3Audios.length} Phổ Biến Nhất
                </h2>
              </div>

              <div className="flex items-center gap-1.5">
                {top3Audios.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setHeroIndex(idx)}
                    className={`transition-all duration-300 rounded-full border-2 border-[#111113] cursor-pointer ${
                      heroIndex === idx
                        ? 'w-6 h-2.5 bg-[#FFE600] shadow-comic-sm'
                        : 'w-2.5 h-2.5 bg-[var(--surface-muted)] hover:bg-[var(--ink-muted)]'
                    }`}
                    aria-label={`Chuyển tới truyện số ${idx + 1}`}
                  />
                ))}
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
                    <div key={audio.id} className="w-full shrink-0 p-4 flex flex-col gap-3">
                      <div className="flex gap-3.5">
                        <div
                          className="relative w-24 h-28 sm:w-28 sm:h-32 rounded-xl border-2 border-[var(--border-ink)] overflow-hidden shrink-0 bg-[#111113] shadow-comic-sm cursor-pointer group"
                          onClick={() => navigate(`/player/${audio.id}`)}
                        >
                          <img
                            src={audio.thumbnailUrl || '/wavelink-icon.png'}
                            alt={audio.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                          <span
                            className={`absolute top-1.5 left-1.5 badge-comic ${
                              idx === 0
                                ? 'badge-comic-yellow'
                                : idx === 1
                                  ? 'badge-comic-blue'
                                  : 'badge-comic-red'
                            } text-[9px] py-0 px-1.5 font-black`}
                          >
                            TOP #{idx + 1}
                          </span>

                          <span className="absolute bottom-1.5 left-1.5 badge-comic badge-comic-white text-[8px] py-0 px-1.5 font-black">
                            TẬP {String(activeEp?.episodeNumber || 1).padStart(2, '0')}
                          </span>
                        </div>

                        <div className="flex flex-col justify-between min-w-0 flex-1">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                              <span className="badge-comic badge-comic-blue text-[9px] py-0 px-1.5 font-bold">
                                {audio.categoryName || 'Chung'}
                              </span>
                              <span className="badge-comic badge-comic-purple text-[9px] py-0 px-1.5 font-bold flex items-center gap-1">
                                <Eye className="w-2.5 h-2.5" strokeWidth={2.5} />
                                {(audio.viewCount || 0).toLocaleString()} lượt nghe
                              </span>
                              {audio.isVIPOnly && (
                                <span className="badge-comic badge-comic-red text-[9px] py-0 px-1.5 font-bold">
                                  VIP
                                </span>
                              )}
                            </div>

                            <h3
                              className="font-extrabold text-sm sm:text-base text-[var(--ink-primary)] line-clamp-2 cursor-pointer hover:text-[#3A86FF] transition-colors leading-snug"
                              onClick={() => navigate(`/player/${audio.id}`)}
                            >
                              {audio.title}
                            </h3>
                            <span className="text-xs font-semibold text-[var(--ink-secondary)] truncate mt-1">
                              Tác giả: {audio.author || 'Đang cập nhật'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs font-mono font-bold text-[var(--ink-secondary)] pt-1.5">
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

                      <div className="flex items-center justify-between pt-2 border-t-2 border-[var(--border-ink)]/30">
                        <button
                          type="button"
                          onClick={() => navigate(`/player/${audio.id}`)}
                          className="btn-comic text-xs py-1.5 px-3"
                        >
                          <ListMusic className="w-3.5 h-3.5" strokeWidth={2.25} />
                          <span>Danh sách tập</span>
                        </button>
                        <button
                          type="button"
                          onClick={handlePlay}
                          className={`btn-comic ${
                            isThisPlaying ? 'btn-comic-yellow' : 'btn-comic-primary'
                          } text-xs py-1.5 px-4 font-black`}
                        >
                          {isThisPlaying ? (
                            <Pause className="w-4 h-4 fill-current" strokeWidth={2.5} />
                          ) : (
                            <Play className="w-4 h-4 fill-current" strokeWidth={2.5} />
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

              {top3Audios.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setHeroIndex((prev) => (prev - 1 + top3Audios.length) % top3Audios.length)
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[var(--surface-card)]/90 border-2 border-[var(--border-ink)] shadow-comic-sm flex items-center justify-center text-[var(--ink-primary)] hover:bg-[#FFE600] hover:text-[#111113] active:scale-90 transition-all z-10 cursor-pointer"
                    aria-label="Truyện trước"
                  >
                    <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeroIndex((prev) => (prev + 1) % top3Audios.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[var(--surface-card)]/90 border-2 border-[var(--border-ink)] shadow-comic-sm flex items-center justify-center text-[var(--ink-primary)] hover:bg-[#FFE600] hover:text-[#111113] active:scale-90 transition-all z-10 cursor-pointer"
                    aria-label="Truyện kế tiếp"
                  >
                    <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                  </button>
                </>
              )}
            </div>
          </section>
        ) : (
          <section className="lg:col-span-8 card-comic p-6 text-center flex flex-col items-center gap-3">
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

        {/* Right: Recent History / Quick Action Panel */}
        <section
          className={`${history && history.length > 0 ? 'lg:col-span-5' : 'lg:col-span-4'} flex flex-col gap-2.5`}
        >
          {history && history.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <History className="w-4 h-4 text-[#3A86FF]" strokeWidth={2.5} />
                  <h2 className="font-comic font-extrabold text-sm uppercase text-[var(--ink-primary)] tracking-tight">
                    Vừa Cày Gần Đây
                  </h2>
                </div>
                <span className="badge-comic badge-comic-white text-[9px] font-bold">
                  {history.length} bản ghi
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {history.slice(0, 4).map((item) => (
                  <div
                    key={`${item.audioId}-${item.episodeId}`}
                    className="card-comic-sm p-2.5 flex items-center justify-between gap-2.5 hover:bg-[var(--surface-elevated)] transition-all cursor-pointer"
                    onClick={() => navigate(`/player/${item.audioId}`)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg border-2 border-[#111113] bg-[#FFE600] flex items-center justify-center text-[#111113] shrink-0 shadow-comic-sm">
                        <History className="w-4 h-4" strokeWidth={2.5} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate leading-tight">
                          {item.title || 'Truyện Audio'}
                        </span>
                        <span className="text-[11px] font-semibold text-[var(--ink-secondary)] truncate mt-0.5">
                          {item.currentEpisodeTitle || item.episodeTitle || 'Tập 1'} · Mốc:{' '}
                          {item.formattedPosition || '00:00:00'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="w-8 h-8 rounded-lg border-2 border-[#111113] bg-[#3A86FF] text-white flex items-center justify-center shadow-comic-sm hover:scale-105 shrink-0 cursor-pointer"
                      aria-label="Phát"
                    >
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="hidden lg:flex card-comic p-4 flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg border-2 border-[#111113] bg-[#3A86FF] text-white flex items-center justify-center">
                  <Compass className="w-4 h-4" strokeWidth={2.25} />
                </div>
                <span className="font-comic font-black text-xs uppercase text-[var(--ink-primary)]">
                  Khám Phá Nhanh
                </span>
              </div>
              <p className="text-xs font-medium text-[var(--ink-secondary)] leading-relaxed">
                Dán bất kỳ đường dẫn video YouTube nào để chia tập tự động, lưu mốc thời gian và phát chạy ngầm mượt mà.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/upload')}
                  className="btn-comic btn-comic-yellow text-xs flex-1"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> Nhập Link
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/library')}
                  className="btn-comic text-xs flex-1"
                >
                  Thư Viện
                </button>
              </div>
            </div>
          )}
        </section>
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

      {/* 3B. BỘ TRUYỆN NHIỀU PHẦN (Tự động gom cụm truyện cùng tên) */}
      {groupedSeries.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#8338EC]" strokeWidth={2.5} />
              <h2 className="font-comic font-extrabold text-sm uppercase text-[var(--ink-primary)] tracking-tight">
                Bộ Truyện Nhiều Phần ({groupedSeries.length})
              </h2>
            </div>
            <span className="text-[11px] font-bold text-[var(--ink-muted)] hidden sm:inline">
              Chạm để lọc trọn bộ trong Thư viện
            </span>
          </div>

          <div className="flex overflow-x-auto sm:overflow-visible sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pb-1.5 no-scrollbar">
            {groupedSeries.map((series) => (
              <div
                key={series.key}
                role="button"
                tabIndex={0}
                onClick={() =>
                  navigate(`/library?search=${encodeURIComponent(series.searchQuery)}`)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/library?search=${encodeURIComponent(series.searchQuery)}`);
                  }
                }}
                className="w-[272px] sm:w-auto shrink-0 card-comic p-3 flex flex-col gap-2.5 card-comic-interactive cursor-pointer group bg-[var(--surface-card)]"
              >
                <div className="flex gap-3 items-start">
                  {/* Stacked comic cover effect signifying multiple parts */}
                  <div className="relative shrink-0 pr-1.5 pb-1.5">
                    <div
                      aria-hidden="true"
                      className="absolute top-1.5 left-1.5 right-0 bottom-0 rounded-xl border-2 border-[var(--border-ink)] bg-[#FFE600]"
                    />
                    <img
                      src={series.thumbnailUrl}
                      alt={series.seriesTitle}
                      className="relative w-16 h-20 rounded-xl object-cover border-2 border-[var(--border-ink)] bg-[#111113] group-hover:-translate-y-0.5 transition-transform"
                    />
                  </div>

                  <div className="flex flex-col flex-1 min-w-0 gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="badge-comic badge-comic-purple text-[9px] py-0 px-1.5 font-black">
                        {series.partCount} PHẦN
                      </span>
                      <span className="badge-comic badge-comic-yellow text-[9px] py-0 px-1.5 font-black">
                        {series.totalEpisodes} TẬP
                      </span>
                    </div>
                    <h3 className="font-extrabold text-xs sm:text-[13px] text-[var(--ink-primary)] line-clamp-2 leading-snug group-hover:text-[#3A86FF] transition-colors">
                      {series.seriesTitle}
                    </h3>
                    <span className="text-[11px] font-semibold text-[var(--ink-muted)] truncate">
                      {series.author}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-ink)]/15 text-[11px]">
                  <span className="font-mono font-bold text-[var(--ink-secondary)] flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#2A9D8F]" strokeWidth={2.5} />
                    {series.totalDurationSeconds > 0
                      ? formatTime(series.totalDurationSeconds)
                      : `${series.totalEpisodes} tập`}
                  </span>
                  <span className="font-extrabold text-[#3A86FF] flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                    <span>Xem trọn bộ</span>
                    <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. DANH SÁCH TRUYỆN: TABS MỚI CẬP NHẬT & PHỔ BIẾN */}
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
            <button
              type="button"
              onClick={() => navigate('/library')}
              className="text-xs font-extrabold text-[#3A86FF] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <span>Xem tất cả ({displayAudios.length})</span>
              <ChevronRight className="w-4 h-4" />
            </button>
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
          <div className="flex overflow-x-auto sm:overflow-visible sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 pb-2 no-scrollbar">
            {displayAudios.map((audio, index) => (
              <div
                key={audio.id}
                className="w-36 sm:w-auto flex flex-col gap-2 shrink-0 cursor-pointer group"
                onClick={() => navigate(`/player/${audio.id}`)}
              >
                <div className="card-comic w-full aspect-[3/4] overflow-hidden relative card-comic-interactive">
                  <img
                    src={audio.thumbnailUrl || '/wavelink-icon.png'}
                    alt={audio.title}
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
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. CÀY XUYÊN ĐÊM: BỘ TRƯỜNG THIÊN THỜI LƯỢNG KHỦNG */}
      {marathonPicks.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#2A9D8F]" strokeWidth={2.5} />
              <h2 className="font-comic font-extrabold text-sm uppercase text-[var(--ink-primary)] tracking-tight">
                Cày Xuyên Đêm • Thời Lượng Khủng
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/library')}
              className="text-xs font-extrabold text-[#3A86FF] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <span>Thư viện</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {marathonPicks.map((audio) => (
              <div
                key={`marathon-${audio.id}`}
                onClick={() => navigate(`/player/${audio.id}`)}
                className="card-comic p-3 flex items-center gap-3 card-comic-interactive cursor-pointer group"
              >
                <div className="relative w-20 h-20 rounded-xl border-2 border-[var(--border-ink)] overflow-hidden shrink-0 bg-[#111113]">
                  <img
                    src={audio.thumbnailUrl || '/wavelink-icon.png'}
                    alt={audio.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <span className="absolute bottom-1 left-1 right-1 badge-comic badge-comic-yellow text-[8px] py-0 px-1 justify-center font-black">
                    {audio.totalEpisodes || audio.episodes?.length || 1} TẬP
                  </span>
                </div>

                <div className="flex flex-col flex-1 min-w-0 gap-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="badge-comic badge-comic-green text-[9px] py-0 px-1.5 font-mono font-black">
                      <Clock className="w-2.5 h-2.5" strokeWidth={2.5} />
                      {audio.formattedDuration || formatTime(audio.totalDurationSeconds || 0)}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--ink-muted)] truncate">
                      {audio.categoryName || 'Chung'}
                    </span>
                  </div>
                  <h3 className="font-extrabold text-xs sm:text-[13px] text-[var(--ink-primary)] line-clamp-2 leading-snug group-hover:text-[#3A86FF] transition-colors">
                    {audio.title}
                  </h3>
                  <div className="flex items-center justify-between text-[11px] text-[var(--ink-secondary)]">
                    <span className="truncate font-semibold">{audio.author || 'Official'}</span>
                    <span className="font-mono font-bold text-[10px] shrink-0 flex items-center gap-1">
                      <Eye className="w-3 h-3 text-[#8338EC]" strokeWidth={2.5} />
                      {(audio.viewCount || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. KHÁM PHÁ THEO THẺ (#TAGS) & KÊNH / TÁC GIẢ NỔI BẬT */}
      {(discoveryTags.length > 0 || topAuthors.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {discoveryTags.length > 0 && (
            <section
              className={`${topAuthors.length > 0 ? 'lg:col-span-6' : 'lg:col-span-12'} card-comic p-4 flex flex-col gap-3`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-[#E63946]" strokeWidth={2.5} />
                  <h2 className="font-comic font-extrabold text-sm uppercase text-[var(--ink-primary)] tracking-tight">
                    Từ Khóa Nổi Bật
                  </h2>
                </div>
                <span className="text-[10px] font-bold text-[var(--ink-muted)]">
                  Chạm để tìm nhanh
                </span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar flex-nowrap lg:flex-wrap">
                {discoveryTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => navigate(`/library?search=${encodeURIComponent(tag)}`)}
                    className="badge-comic badge-comic-white hover:bg-[#FFE600] hover:text-[#111113] transition-colors text-[11px] py-1 px-2.5 shrink-0 cursor-pointer font-bold"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </section>
          )}

          {topAuthors.length > 0 && (
            <section
              className={`${discoveryTags.length > 0 ? 'lg:col-span-6' : 'lg:col-span-12'} card-comic p-4 flex flex-col gap-3`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Mic2 className="w-4 h-4 text-[#3A86FF]" strokeWidth={2.5} />
                  <h2 className="font-comic font-extrabold text-sm uppercase text-[var(--ink-primary)] tracking-tight">
                    Kênh & Tác Giả Nổi Bật
                  </h2>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {topAuthors.map((author) => (
                  <button
                    key={author.name}
                    type="button"
                    onClick={() => navigate(`/library?search=${encodeURIComponent(author.name)}`)}
                    className="card-comic-sm p-2.5 flex items-center gap-2.5 text-left hover:bg-[var(--surface-accent-soft)] transition-colors cursor-pointer group"
                  >
                    <img
                      src={author.sampleThumbnail}
                      alt={author.name}
                      className="w-10 h-10 rounded-lg object-cover border-2 border-[var(--border-ink)] shrink-0"
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate group-hover:text-[#3A86FF]">
                        {author.name}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--ink-muted)] truncate">
                        {author.audioCount} bộ • {author.totalEpisodes} tập
                      </span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
