'use client';

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Headphones,
  Share2,
  Heart,
  Disc3,
  Crown,
  Info,
  ChevronUp,
  ChevronDown,
  Eye,
  Youtube,
  History,
  RefreshCw,
  Play,
  Pause,
  Lock,
  Unlock,
  Gauge,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Moon,
  Search,
  XCircle,
  Check,
  Save,
  ListMusic,
  ArrowLeft,
  Tag,
} from 'lucide-react';
import { useAudio, useToggleFavorite } from '@/hooks/useAudio';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import { PlayerSkeleton } from '@/components/common/Skeletons';
import { Modal } from '@/components/ui/Modal';
import { Slider } from '@/components/ui/Slider';
import { Equalizer } from '@/components/ui/Equalizer';
import { formatTime } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { ShareStoryModal } from '@/components/community/ShareStoryModal';
import { resumeAudioContextOnGesture } from '@/lib/backgroundAudioKeeper';
import { AudioItem } from '@/types';

export interface PlayerPageProps {
  initialAudio?: AudioItem | null;
}

export const PlayerPage: React.FC<PlayerPageProps> = ({ initialAudio }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data: audio, isLoading } = useAudio(id, initialAudio);
  const toggleFavoriteMutation = useToggleFavorite();

  const {
    currentAudio,
    currentEpisode,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    sleepTimerMinutes,
    play,
    togglePlay,
    seekTo,
    skipSeconds,
    prevEpisode,
    nextEpisode,
    setPlaybackRate,
    setSleepTimer,
    setScreenLocked,
  } = usePlayerStore();

  const [isSpeedModalOpen, setIsSpeedModalOpen] = useState(false);
  const [isSleepModalOpen, setIsSleepModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scrubPercent, setScrubPercent] = useState<number | null>(null);
  const [episodePage, setEpisodePage] = useState(1);
  const [syncedRecentInfo, setSyncedRecentInfo] = useState<{ position: string; epNumber: number } | null>(null);
  const [syncCountdown, setSyncCountdown] = useState<number>(60);
  const [optimisticFavorite, setOptimisticFavorite] = useState<boolean | null>(null);
  const [isSeekLocked, setIsSeekLocked] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('wavelink_seek_locked') === 'true';
    }
    return false;
  });

  const [activeTab, setActiveTab] = useState<'player' | 'episodes'>('player');
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(true);
  const [episodeSearch, setEpisodeSearch] = useState('');

  const touchStartXRef = React.useRef<number | null>(null);
  const touchStartYRef = React.useRef<number | null>(null);
  const touchCurrentXRef = React.useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    touchCurrentXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const endX =
      touchCurrentXRef.current !== null
        ? touchCurrentXRef.current
        : (e.changedTouches[0]?.clientX ?? touchStartXRef.current);
    const endY = e.changedTouches[0]?.clientY ?? touchStartYRef.current;
    const deltaX = endX - touchStartXRef.current;
    const deltaY = endY - touchStartYRef.current;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 50) {
        setActiveTab('episodes');
      } else if (deltaX < -50) {
        setActiveTab('player');
      }
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
    touchCurrentXRef.current = null;
  };

  const toggleSeekLock = () => {
    const nextVal = !isSeekLocked;
    setIsSeekLocked(nextVal);
    if (typeof window !== 'undefined') {
      localStorage.setItem('wavelink_seek_locked', String(nextVal));
    }
    if (nextVal) {
      toast.info('Đã khóa thanh tua thời lượng! Chống chạm nhầm khi nghe.');
    } else {
      toast.success('Đã mở khóa thanh tua thời lượng.');
    }
  };

  const isTargetAudioPlaying = Boolean(
    audio && currentAudio && String(currentAudio.id) === String(audio.id)
  );

  const currentTimeRef = React.useRef(currentTime);
  currentTimeRef.current = currentTime;
  const currentEpisodeRef = React.useRef(currentEpisode);
  currentEpisodeRef.current = currentEpisode;

  const episodesList = React.useMemo(() => audio?.episodes || [], [audio?.episodes]);
  const filteredEpisodes = React.useMemo(() => {
    if (!episodeSearch.trim()) return episodesList;
    const q = episodeSearch.toLowerCase().trim();
    return episodesList.filter(
      (ep) =>
        ep.title.toLowerCase().includes(q) ||
        String(ep.episodeNumber).includes(q)
    );
  }, [episodesList, episodeSearch]);

  const totalEpisodePages = Math.max(1, Math.ceil(filteredEpisodes.length / DEFAULT_PAGE_SIZE));
  const currentEpisodePage = Math.min(Math.max(1, episodePage), totalEpisodePages);
  const pagedEpisodes = filteredEpisodes.slice(
    (currentEpisodePage - 1) * DEFAULT_PAGE_SIZE,
    currentEpisodePage * DEFAULT_PAGE_SIZE
  );

  const normalizedTags = React.useMemo(() => {
    const rawTags = Array.isArray(audio?.tags) ? audio.tags : [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const item of rawTags) {
      const text =
        typeof item === 'string'
          ? item
          : item && typeof item === 'object' && 'name' in item
            ? String((item as { name?: unknown }).name ?? '')
            : '';
      const cleaned = text.replace(/^#/, '').trim();
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(cleaned);
    }
    return list;
  }, [audio?.tags]);

  React.useEffect(() => {
    setOptimisticFavorite(null);
  }, [audio?.id, audio?.isFavorite]);

  React.useEffect(() => {
    if (!isTargetAudioPlaying || !isPlaying) {
      setSyncCountdown(60);
      return;
    }

    const timer = setInterval(() => {
      setSyncCountdown((prev) => {
        if (prev <= 1) {
          const cTime = currentTimeRef.current;
          const cEp = currentEpisodeRef.current;
          if (cTime > 0) {
            setSyncedRecentInfo({
              position: formatTime(cTime),
              epNumber: cEp?.episodeNumber || 1,
            });
            if (audio?.id) {
              queryClient.invalidateQueries({ queryKey: ['audio'] });
            }
          }
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isTargetAudioPlaying, isPlaying, audio?.id, queryClient]);

  const showSkeletonFallback = useDelayedFallback(isLoading && !audio, 180);

  const handleManualSyncRecent = () => {
    const cTime =
      currentTimeRef.current > 0 ? currentTimeRef.current : (audio?.lastPositionSeconds || 0);
    const epNum = currentEpisodeRef.current?.episodeNumber || audio?.currentEpisodeNumber || 1;
    setSyncedRecentInfo({
      position: formatTime(cTime),
      epNumber: epNum,
    });
    if (audio?.id) {
      queryClient.invalidateQueries({ queryKey: ['audio'] });
    }
    setSyncCountdown(60);
    toast.success('Đã đồng bộ mốc nghe gần nhất!');
  };

  if (showSkeletonFallback) {
    return <PlayerSkeleton />;
  }

  if (isLoading && !audio) {
    return <div className="w-full max-w-6xl mx-auto px-4 md:px-6 min-h-[60vh]" />;
  }

  if (!audio) {
    return (
      <div className="w-full max-w-lg mx-auto flex flex-col items-center justify-center p-10 text-center gap-4 fade-in-comic">
        <div className="w-16 h-16 rounded-2xl border-2 border-[#111113] bg-[#FFE600] text-[#111113] flex items-center justify-center shadow-comic">
          <Disc3 className="w-8 h-8" strokeWidth={2.25} />
        </div>
        <h3 className="font-extrabold text-lg text-[var(--ink-primary)] uppercase">
          Không tìm thấy bản ghi audio
        </h3>
        <button
          type="button"
          onClick={() => navigate('/library')}
          className="btn-comic btn-comic-primary text-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Về Thư Viện</span>
        </button>
      </div>
    );
  }

  const isVipOrAdmin =
    user?.role === 'VIP' || user?.role === 'ADMIN' || user?.membership === 'VIP';
  const isVipAudio = Boolean(audio.isVIPOnly || audio.isVipOnly);
  const isGuest = !user || user.isGuest || user.role === 'GUEST';

  const isFavorite = optimisticFavorite !== null ? optimisticFavorite : Boolean(audio.isFavorite);

  const handleToggleFavorite = () => {
    const nextVal = !isFavorite;
    setOptimisticFavorite(nextVal);
    toggleFavoriteMutation.mutate(audio.id, {
      onError: () => {
        setOptimisticFavorite(!nextVal);
        toast.error('Không thể cập nhật trạng thái yêu thích');
      },
    });
    if (nextVal) {
      toast.success('Đã thêm vào danh sách yêu thích!');
    } else {
      toast.info('Đã xóa khỏi danh sách yêu thích.');
    }
  };

  const isEpLocked = (ep: { episodeNumber: number; isVip?: boolean; isLocked?: boolean }) => {
    if (isVipOrAdmin) return false;
    const isVip = isVipAudio || Boolean(ep.isVip);
    if (!isVip) return false;
    const freeLimit = audio.freeEpisodesCount !== undefined ? audio.freeEpisodesCount : 1;
    return ep.episodeNumber > freeLimit || freeLimit === 0 || Boolean(ep.isLocked);
  };

  const handleLockedEpisodeAction = (customMsg?: string) => {
    if (isGuest) {
      toast.info(customMsg || 'Tập VIP chỉ dành cho thành viên. Vui lòng đăng nhập để nghe!');
      navigate('/login');
    } else {
      toast.error(
        customMsg ||
          'Tập 2 trở đi chỉ dành riêng cho thành viên VIP. Vui lòng nâng cấp gói để tiếp tục nghe!'
      );
      navigate('/membership');
    }
  };

  const activeEp =
    isTargetAudioPlaying && currentEpisode
      ? currentEpisode
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
  const currentPosition = isTargetAudioPlaying ? currentTime : audio.lastPositionSeconds || 0;
  const rawPercent = Math.min(100, Math.round((currentPosition / episodeDuration) * 100));
  const currentPercent = scrubPercent !== null ? scrubPercent : rawPercent;

  const handleMasterPlay = () => {
    resumeAudioContextOnGesture();
    if (isEpLocked(activeEp)) {
      handleLockedEpisodeAction();
      return;
    }
    if (isTargetAudioPlaying) {
      togglePlay();
    } else {
      play(audio, activeEp, currentPosition);
    }
  };

  const handleResumeShortcut = () => {
    const epId = audio.currentEpisodeId;
    const epNum = audio.currentEpisodeNumber || 1;
    const targetEp =
      audio.episodes?.find((e) => (epId && e.id === epId) || e.episodeNumber === epNum) ||
      audio.episodes?.[0];
    if (targetEp && isEpLocked(targetEp)) {
      handleLockedEpisodeAction('Tập cần nghe tiếp chỉ dành riêng cho thành viên VIP.');
      return;
    }
    if (targetEp) {
      play(audio, targetEp, audio.lastPositionSeconds || 0);
    }
  };

  const handleShare = () => {
    setIsShareModalOpen(true);
  };

  const handleRefreshMetadata = async () => {
    setIsRefreshing(true);
    try {
      toast.info('Đang làm mới thông tin từ YouTube...');
      await api.audio.refreshAudio(audio.id);
      queryClient.invalidateQueries({ queryKey: ['audio', audio.id] });
      toast.success('Đã cập nhật dữ liệu mới nhất!');
    } catch {
      toast.error('Lỗi khi làm mới audio');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div
      className="w-full max-w-6xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-4 fade-in-comic select-none sm:select-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* 1. Top Sub-Bar Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn-comic text-xs py-1.5 px-3"
          aria-label="Quay lại"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
          <span>Quay lại</span>
        </button>

        <div className="badge-comic badge-comic-yellow text-xs font-black">
          <Headphones className="w-3.5 h-3.5" strokeWidth={2.5} />
          <span>WAVELINK PLAYER</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            className="w-9 h-9 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-card)] flex items-center justify-center text-[var(--ink-primary)] shadow-comic-sm hover:bg-[var(--surface-muted)] cursor-pointer"
            title="Chia sẻ"
          >
            <Share2 className="w-4 h-4" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={handleToggleFavorite}
            className="w-9 h-9 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-card)] flex items-center justify-center shadow-comic-sm hover:bg-[var(--surface-muted)] cursor-pointer transition-transform"
            title="Yêu thích"
            aria-pressed={isFavorite}
          >
            <Heart
              className={`w-4 h-4 transition-transform ${
                isFavorite
                  ? 'text-[#E63946] fill-[#E63946] scale-110'
                  : 'text-[var(--ink-primary)]'
              }`}
              strokeWidth={2.5}
            />
          </button>
        </div>
      </div>

      {/* Mobile Tab Navigation Bar (hidden on lg+ where both panels show side-by-side) */}
      <div className="flex lg:hidden items-center gap-2 w-full">
        <button
          type="button"
          onClick={() => setActiveTab('player')}
          className={`flex-1 py-2 px-3 rounded-xl border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'player'
              ? 'bg-[#FFE600] text-[#111113] border-[#111113] shadow-comic-sm'
              : 'bg-[var(--surface-card)] border-[var(--border-ink)] text-[var(--ink-secondary)] hover:bg-[var(--surface-muted)]'
          }`}
        >
          <Headphones className="w-4 h-4" strokeWidth={2.25} />
          <span>Trình Phát</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('episodes')}
          className={`flex-1 py-2 px-3 rounded-xl border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'episodes'
              ? 'bg-[#FFE600] text-[#111113] border-[#111113] shadow-comic-sm'
              : 'bg-[var(--surface-card)] border-[var(--border-ink)] text-[var(--ink-secondary)] hover:bg-[var(--surface-muted)]'
          }`}
        >
          <ListMusic className="w-4 h-4" strokeWidth={2.25} />
          <span>Danh Sách Tập ({audio.episodes?.length || 0})</span>
        </button>
      </div>

      {/* Adaptive 2-Column Workspace on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Player Console */}
        <div
          className={`lg:col-span-7 flex-col gap-4 fade-in-comic ${
            activeTab === 'player' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Vinyl Cover Presentation Card */}
          <div className="card-comic p-4 md:p-5 flex flex-col gap-3.5 relative">
            <div className="sticker-comic">
              <span
                className={`badge-comic ${
                  isTargetAudioPlaying && isPlaying ? 'badge-comic-red' : 'badge-comic-blue'
                } text-[10px]`}
              >
                {isTargetAudioPlaying && isPlaying ? '● LIVE STREAM' : 'SẴN SÀNG'}
              </span>
            </div>

            <div className="relative w-full aspect-[16/10] max-h-64 rounded-xl border-2 border-[var(--border-ink)] overflow-hidden bg-[#111113] flex items-center justify-center shadow-comic-sm">
              <img
                className="w-full h-full object-cover"
                src={audio.thumbnailUrl || '/wavelink-icon.png'}
                alt={audio.title}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

              {/* Spinning Vinyl Disc */}
              <div
                className={`absolute -right-8 -bottom-8 w-36 h-36 rounded-full border-4 border-[#111113] bg-[#141418] shadow-comic flex items-center justify-center ${
                  isTargetAudioPlaying && isPlaying ? 'spin-disc' : 'spin-disc spin-disc-paused'
                } pointer-events-none opacity-90`}
              >
                <div className="w-24 h-24 rounded-full border border-gray-700 bg-[#1F1F24] flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full border-2 border-[#111113] bg-[#FFE600] flex items-center justify-center text-[#111113]">
                    <Disc3 className="w-6 h-6" strokeWidth={2.5} />
                  </div>
                </div>
              </div>

              <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-white z-10">
                <span className="badge-comic badge-comic-yellow text-[10px] text-[#111113]">
                  TẬP {String(activeEp.episodeNumber || 1).padStart(2, '0')}: {currentPercent}%
                </span>
              </div>
            </div>

            {/* Title, Author & Tags */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="badge-comic badge-comic-blue text-[10px]">
                  {audio.categoryName || 'Chung'}
                </span>
                {audio.isVIPOnly && (
                  <span className="badge-comic badge-comic-purple text-[10px]">
                    <Crown className="w-3 h-3" strokeWidth={2.5} /> VIP ONLY
                  </span>
                )}
                <span className="badge-comic badge-comic-white text-[10px]">
                  {audio.totalEpisodes || audio.episodes?.length || 1} TẬP
                </span>
                <span className="badge-comic badge-comic-white text-[10px]">
                  {audio.formattedDuration || '24h 00m'}
                </span>
              </div>

              <h1 className="font-extrabold text-lg md:text-xl text-[var(--ink-primary)] leading-snug mt-1">
                {audio.title}
              </h1>
              <p className="text-xs font-semibold text-[var(--ink-secondary)] flex items-center gap-2">
                <span>
                  Tác giả: <strong className="text-[var(--ink-primary)]">{audio.author || 'Chưa rõ'}</strong>
                </span>
              </p>

              {/* Description Accordion */}
              <button
                type="button"
                onClick={() => setIsDescriptionOpen((prev) => !prev)}
                className="mt-2 text-xs font-bold text-[var(--ink-primary)] flex items-center justify-between py-2 px-3 rounded-xl border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-accent-soft)] transition-colors shadow-comic-sm cursor-pointer"
                aria-expanded={isDescriptionOpen}
              >
                <span className="flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-[#3A86FF]" strokeWidth={2.5} />
                  <span>Thông tin chi tiết & Nguồn YouTube</span>
                </span>
                {isDescriptionOpen ? (
                  <ChevronUp className="w-4 h-4" strokeWidth={2.5} />
                ) : (
                  <ChevronDown className="w-4 h-4" strokeWidth={2.5} />
                )}
              </button>

              {isDescriptionOpen && (
                <div className="mt-1 p-3.5 bg-[var(--surface-elevated)] rounded-xl border-2 border-[var(--border-ink)] flex flex-col gap-2.5 text-xs text-[var(--ink-secondary)] shadow-comic-sm fade-in-comic">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-[var(--border-ink)]/25">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-semibold">
                        Tác giả: <strong className="text-[var(--ink-primary)]">{audio.author || 'Chưa rõ'}</strong>
                      </span>
                      {audio.viewCount !== undefined && audio.viewCount !== null && (
                        <span className="badge-comic badge-comic-yellow text-[10px] font-mono">
                          <Eye className="w-3 h-3" strokeWidth={2.5} />
                          Lượt xem: {Number(audio.viewCount).toLocaleString('vi-VN')}
                        </span>
                      )}
                    </div>
                    {audio.youtubeVideoId && (
                      <a
                        href={`https://www.youtube.com/watch?v=${audio.youtubeVideoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-comic text-[11px] py-1 px-2.5 bg-[#FF0000] border-[#111113] text-white hover:bg-red-700 font-bold"
                        title="Mở video gốc trên YouTube"
                      >
                        <Youtube className="w-4 h-4" strokeWidth={2.25} />
                        <span>YouTube</span>
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-extrabold text-[var(--ink-primary)] uppercase">
                      Mô tả video:
                    </span>
                    <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-[var(--ink-secondary)] bg-[var(--surface-card)] p-3 rounded-lg border border-[var(--border-ink)]/40 leading-relaxed">
                      {audio.description ? (
                        audio.description
                      ) : (
                        <span className="italic text-[var(--ink-muted)]">
                          Không có mô tả cho audio này.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 pt-1 border-t border-[var(--border-ink)]/15">
                    <span className="text-[11px] font-extrabold text-[var(--ink-primary)] uppercase flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-[#3A86FF]" strokeWidth={2.5} />
                      <span>Thẻ gắn ({normalizedTags.length}):</span>
                    </span>
                    {normalizedTags.length > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {normalizedTags.map((tagName) => (
                          <button
                            key={tagName}
                            type="button"
                            onClick={() => navigate(`/library?search=${encodeURIComponent(tagName)}`)}
                            className="badge-comic badge-comic-white hover:bg-[#FFE600] hover:text-[#111113] transition-colors text-[10px] py-0.5 px-2 cursor-pointer font-bold"
                          >
                            #{tagName}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] italic text-[var(--ink-muted)]">
                        Chưa gắn thẻ cho audio này.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Resume Bar Shortcut */}
          <div className="card-comic-sm p-3 bg-[var(--surface-accent-soft)] flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg border-2 border-[#111113] bg-[#FFE600] flex items-center justify-center text-[#111113] shrink-0 shadow-comic-sm">
                <History className="w-4 h-4" strokeWidth={2.5} />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-extrabold uppercase text-[var(--ink-secondary)]">
                    Mốc nghe gần nhất
                  </span>
                  <button
                    type="button"
                    onClick={handleManualSyncRecent}
                    className="badge-comic badge-comic-yellow text-[9px] font-mono shrink-0 flex items-center gap-1 cursor-pointer hover:bg-yellow-300 active:scale-95 transition-all"
                    title="Đang đếm ngược để đồng bộ mốc nghe. Chạm để đồng bộ ngay!"
                  >
                    <RefreshCw
                      className={`w-2.5 h-2.5 ${isTargetAudioPlaying && isPlaying ? 'animate-spin' : ''}`}
                      strokeWidth={2.5}
                    />
                    SYNC: {isTargetAudioPlaying && isPlaying ? `${syncCountdown}s` : '60s'}
                  </button>
                </div>
                <span className="text-xs font-bold text-[var(--ink-primary)] truncate flex items-center gap-1 mt-0.5">
                  Tiếp tục từ{' '}
                  <strong>
                    {syncedRecentInfo?.position ||
                      (isTargetAudioPlaying && currentTime > 0
                        ? formatTime(currentTime)
                        : audio.formattedPosition || '00:00:00')}
                  </strong>
                  : (Tập{' '}
                  {syncedRecentInfo?.epNumber ||
                    (isTargetAudioPlaying && currentEpisode
                      ? currentEpisode.episodeNumber
                      : audio.currentEpisodeNumber || 1)}
                  )<span className="text-[10px] font-mono"> {currentPercent}%</span>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResumeShortcut}
              className="btn-comic btn-comic-primary text-xs py-1.5 px-3 shrink-0"
            >
              <Play className="w-3.5 h-3.5 fill-current" strokeWidth={2.5} />
              <span>Nghe tiếp</span>
            </button>
          </div>

          {/* Main Playback Console */}
          <div className="card-comic p-4 md:p-5 flex flex-col gap-3.5">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-[var(--border-ink)]/30">
              <div className="flex items-center gap-2 min-w-0">
                <Equalizer isPlaying={isTargetAudioPlaying && isPlaying} />
                <span className="font-extrabold text-[var(--ink-primary)] truncate">
                  {activeEp.title}
                </span>
              </div>
              <button
                type="button"
                onClick={handleManualSyncRecent}
                className="badge-comic badge-comic-teal text-[9px] py-0.5 font-mono cursor-pointer hover:opacity-90 active:scale-95 transition-all flex items-center gap-1"
                title="Tự động đồng bộ mốc nghe mỗi 60s. Chạm để đồng bộ ngay!"
              >
                <RefreshCw
                  className={`w-2.5 h-2.5 ${isTargetAudioPlaying && isPlaying ? 'animate-spin' : ''}`}
                  strokeWidth={2.5}
                />
                <span>SYNC: {syncCountdown}s</span>
              </button>
            </div>

            {/* Scrub Bar */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-2">
                <div
                  className="flex-1"
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                >
                  <Slider
                    disabled={isSeekLocked}
                    value={currentPercent}
                    min={0}
                    max={100}
                    onChange={(e) => {
                      if (isSeekLocked) return;
                      const val = parseFloat(e.target.value);
                      setScrubPercent(val);
                      const targetSec = Math.round((val / 100) * episodeDuration);
                      if (isTargetAudioPlaying) {
                        seekTo(targetSec);
                      } else {
                        play(audio, activeEp, targetSec);
                      }
                    }}
                    onPointerUp={() => setScrubPercent(null)}
                    onTouchEnd={() => setScrubPercent(null)}
                    onMouseUp={() => setScrubPercent(null)}
                    className={isSeekLocked ? 'cursor-not-allowed opacity-50' : ''}
                  />
                </div>
                <button
                  type="button"
                  onClick={toggleSeekLock}
                  className={`w-9 h-9 rounded-lg border-2 border-[var(--border-ink)] flex items-center justify-center shrink-0 transition-all shadow-comic-sm cursor-pointer ${
                    isSeekLocked
                      ? 'bg-[#E63946] text-white border-[#111113]'
                      : 'bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[#FFE600] hover:text-[#111113]'
                  }`}
                  title={
                    isSeekLocked
                      ? 'Mở khóa thanh tua thời lượng'
                      : 'Khóa thanh tua thời lượng chống chạm nhầm'
                  }
                >
                  {isSeekLocked ? (
                    <Lock className="w-4 h-4" strokeWidth={2.5} />
                  ) : (
                    <Unlock className="w-4 h-4" strokeWidth={2.5} />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between font-mono text-xs font-bold text-[var(--ink-secondary)]">
                <span>{formatTime(currentPosition)}</span>
                <span
                  className={`badge-comic ${
                    isSeekLocked ? 'badge-comic-red' : 'badge-comic-yellow'
                  } text-[9px] py-0 px-1.5 font-mono`}
                >
                  {isSeekLocked ? 'ĐÃ KHÓA TUA' : `Đã nghe ${currentPercent}%`}
                </span>
                <span>{formatTime(episodeDuration)}</span>
              </div>
            </div>

            {/* Tactile Controls */}
            <div className="flex items-center justify-between gap-1 pt-2">
              <button
                type="button"
                onClick={() => setIsSpeedModalOpen(true)}
                className="btn-comic btn-comic-yellow text-xs py-1.5 px-2.5 font-black"
                title="Đổi tốc độ phát (x1, x1.5, x2...)"
              >
                <Gauge className="w-3.5 h-3.5" strokeWidth={2.5} />
                <span>{playbackRate}x</span>
              </button>

              <button
                type="button"
                onClick={prevEpisode}
                className="w-10 h-10 rounded-xl border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center text-[var(--ink-primary)] shadow-comic-sm hover:bg-[var(--surface-muted)] cursor-pointer"
                title="Tập trước"
              >
                <SkipBack className="w-4 h-4" strokeWidth={2.5} />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isTargetAudioPlaying) skipSeconds(-10);
                  else play(audio, activeEp, Math.max(0, currentPosition - 10));
                }}
                className="w-10 h-10 rounded-xl border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center text-[var(--ink-primary)] shadow-comic-sm hover:bg-[var(--surface-muted)] cursor-pointer"
                title="Tua lùi 10s"
              >
                <RotateCcw className="w-4 h-4" strokeWidth={2.5} />
              </button>

              <button
                type="button"
                onClick={handleMasterPlay}
                className={`w-14 h-14 rounded-full border-2 border-[#111113] ${
                  isTargetAudioPlaying && isPlaying
                    ? 'bg-[#FFE600] text-[#111113]'
                    : 'bg-[#3A86FF] text-white'
                } flex items-center justify-center shadow-comic hover:scale-105 active:translate-y-0.5 transition-all cursor-pointer`}
                title="Phát / Tạm dừng"
              >
                {isTargetAudioPlaying && isPlaying ? (
                  <Pause className="w-7 h-7 fill-current" strokeWidth={2.5} />
                ) : (
                  <Play className="w-7 h-7 fill-current ml-0.5" strokeWidth={2.5} />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isTargetAudioPlaying) skipSeconds(10);
                  else play(audio, activeEp, currentPosition + 10);
                }}
                className="w-10 h-10 rounded-xl border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center text-[var(--ink-primary)] shadow-comic-sm hover:bg-[var(--surface-muted)] cursor-pointer"
                title="Tua tới 10s"
              >
                <RotateCw className="w-4 h-4" strokeWidth={2.5} />
              </button>

              <button
                type="button"
                onClick={() => {
                  const eps = audio.episodes || [];
                  const currIdx = eps.findIndex((e) => e.id === activeEp.id);
                  if (currIdx !== -1 && currIdx + 1 < eps.length) {
                    const nextEp = eps[currIdx + 1];
                    if (isEpLocked(nextEp)) {
                      handleLockedEpisodeAction(
                        'Tập tiếp theo chỉ dành riêng cho thành viên VIP.'
                      );
                      return;
                    }
                  }
                  nextEpisode();
                }}
                className="w-10 h-10 rounded-xl border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center text-[var(--ink-primary)] shadow-comic-sm hover:bg-[var(--surface-muted)] cursor-pointer"
                title="Tập tiếp theo"
              >
                <SkipForward className="w-4 h-4" strokeWidth={2.5} />
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsSleepModalOpen(true)}
                  className={`w-9 h-9 rounded-lg border-2 ${
                    sleepTimerMinutes
                      ? 'bg-[#FFE600] text-[#111113] border-[#111113]'
                      : 'bg-[var(--surface-elevated)] text-[var(--ink-primary)] border-[var(--border-ink)]'
                  } flex items-center justify-center shadow-comic-sm hover:bg-[var(--surface-muted)] cursor-pointer`}
                  title="Hẹn giờ tắt"
                >
                  <Moon className="w-4 h-4" strokeWidth={2.25} />
                </button>

                <button
                  type="button"
                  onClick={() => setScreenLocked(true)}
                  className="w-9 h-9 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] flex items-center justify-center shadow-comic-sm hover:bg-[#FFE600] hover:text-[#111113] cursor-pointer"
                  title="Giữ màn hình / Khóa màn hình (Tránh chạm nhầm)"
                >
                  <Lock className="w-4 h-4" strokeWidth={2.25} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Episodes List (Always visible on Desktop, Tab 2 on Mobile) */}
        <div
          className={`lg:col-span-5 card-comic p-4 flex-col gap-3 fade-in-comic lg:sticky lg:top-20 ${
            activeTab === 'episodes' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div className="flex items-center justify-between pb-2.5 border-b-2 border-[var(--border-ink)] flex-wrap gap-2">
            <div>
              <h3 className="font-extrabold text-base uppercase text-[var(--ink-primary)]">
                Danh sách tập
              </h3>
              <span className="text-xs font-semibold text-[var(--ink-secondary)]">
                {audio.episodes?.length || 0} tập logic · Khối 4 giờ
              </span>
            </div>
            <button
              type="button"
              onClick={handleRefreshMetadata}
              disabled={isRefreshing}
              className="btn-comic text-[11px] py-1 px-2.5"
              title="Đồng bộ lại thông tin từ YouTube"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
            <input
              type="text"
              value={episodeSearch}
              onChange={(e) => {
                setEpisodeSearch(e.target.value);
                setEpisodePage(1);
              }}
              placeholder="Tìm kiếm tập (số tập hoặc tên tập)..."
              className="input-comic pl-9 pr-8 py-2 text-xs"
            />
            {episodeSearch && (
              <button
                type="button"
                onClick={() => {
                  setEpisodeSearch('');
                  setEpisodePage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
                title="Xóa tìm kiếm"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>

          {pagedEpisodes.length === 0 ? (
            <div className="p-6 text-center text-xs font-semibold text-[var(--ink-muted)] bg-[var(--surface-elevated)] rounded-xl border border-dashed border-[var(--border-ink)]/40">
              {episodeSearch
                ? 'Không tìm thấy tập nào khớp với từ khóa tìm kiếm.'
                : 'Chưa có danh sách tập.'}
            </div>
          ) : (
            <div className="flex flex-col gap-2 lg:max-h-[55vh] lg:overflow-y-auto pr-0.5">
              {pagedEpisodes.map((ep) => {
                const isThisEpActive = isTargetAudioPlaying && currentEpisode?.id === ep.id;
                const isCompleted = ep.completed || (ep.progressPercent || 0) >= 95;
                const epLocked = isEpLocked(ep);
                const epIsVip = isVipAudio || Boolean(ep.isVip);

                return (
                  <div
                    key={ep.id}
                    onClick={() => {
                      if (epLocked) {
                        handleLockedEpisodeAction();
                        return;
                      }
                      play(audio, ep, ep.positionSeconds || 0);
                    }}
                    className={`card-comic-sm p-3 flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      epLocked
                        ? 'bg-[#8338EC]/10 border-[#8338EC]/50 opacity-90 hover:bg-[#8338EC]/15'
                        : isThisEpActive
                          ? 'bg-[var(--surface-accent-soft)] !border-2 !border-[#FFE600] shadow-comic-sm'
                          : 'bg-[var(--surface-elevated)] hover:bg-[var(--surface-muted)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg border-2 border-[#111113] flex items-center justify-center shrink-0 shadow-comic-sm ${
                          epLocked
                            ? 'bg-[#8338EC] text-white font-bold'
                            : isThisEpActive
                              ? 'bg-[#FFE600] text-[#111113] font-black'
                              : isCompleted
                                ? 'bg-[#2A9D8F] text-white'
                                : 'bg-[var(--surface-card)] text-[var(--ink-primary)] border-[var(--border-ink)] font-bold text-xs'
                        }`}
                      >
                        {epLocked ? (
                          <Lock className="w-4 h-4 text-[#FFE600]" strokeWidth={2.5} />
                        ) : isThisEpActive ? (
                          <Play className="w-4 h-4 fill-current" strokeWidth={2.5} />
                        ) : isCompleted ? (
                          <Check className="w-4 h-4" strokeWidth={3} />
                        ) : (
                          `T${ep.episodeNumber}`
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate leading-tight">
                            {ep.title}
                          </span>
                          {epIsVip && ep.episodeNumber === 1 && (
                            <span className="badge-comic badge-comic-teal text-[8px] py-0 px-1 font-black shrink-0">
                              <Eye className="w-2.5 h-2.5" /> XEM TRƯỚC TẬP 1
                            </span>
                          )}
                          {epIsVip && ep.episodeNumber > 1 && (
                            <span className="badge-comic badge-comic-purple text-[8px] py-0 px-1 font-black shrink-0">
                              <Crown className="w-2.5 h-2.5 text-[#FFE600]" /> VIP
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[11px] text-[var(--ink-secondary)] truncate mt-0.5">
                          {formatTime(ep.startSeconds)} - {formatTime(ep.endSeconds)} ·{' '}
                          {ep.progressPercent || 0}%
                        </span>
                      </div>
                    </div>

                    <span
                      className={`badge-comic shrink-0 ${
                        epLocked
                          ? 'badge-comic-purple'
                          : isThisEpActive
                            ? 'badge-comic-yellow'
                            : isCompleted
                              ? 'badge-comic-teal'
                              : 'badge-comic-white'
                      } text-[9px]`}
                    >
                      {epLocked ? (
                        <span className="flex items-center gap-0.5">
                          <Lock className="w-2.5 h-2.5" /> KHÓA VIP
                        </span>
                      ) : isThisEpActive ? (
                        'ĐANG PHÁT'
                      ) : isCompleted ? (
                        'ĐÃ XONG'
                      ) : (
                        'CHƯA NGHE'
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <Pagination
            currentPage={currentEpisodePage}
            totalPages={totalEpisodePages}
            totalItems={filteredEpisodes.length}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={(p) => setEpisodePage(p)}
          />
        </div>
      </div>

      {/* Speed Selection Modal */}
      <Modal
        isOpen={isSpeedModalOpen}
        onClose={() => setIsSpeedModalOpen(false)}
        title="TỐC ĐỘ PHÁT AUDIO"
        showFooter={false}
        size="sm"
      >
        <div className="flex flex-col gap-3">
          <p className="text-[11px] sm:text-xs text-[var(--ink-secondary)] font-semibold">
            Tốc độ tiêu chuẩn (Tự động lưu lại cho tất cả audio):
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[1.0, 1.5, 2.0].map((s) => {
              const isSelected = Math.abs(playbackRate - s) < 0.05;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setPlaybackRate(s, user?.id);
                    setIsSpeedModalOpen(false);
                  }}
                  className={`btn-comic text-sm py-2.5 font-black flex items-center justify-center gap-1 ${
                    isSelected ? 'btn-comic-yellow' : ''
                  }`}
                >
                  <span>{s}x</span>
                  {isSelected && <Check className="w-4 h-4" strokeWidth={3} />}
                </button>
              );
            })}
          </div>

          <p className="text-[11px] sm:text-xs text-[var(--ink-muted)] font-semibold mt-1">
            Các mức điều chỉnh khác:
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {[0.5, 0.75, 1.25, 1.75].map((s) => {
              const isSelected = Math.abs(playbackRate - s) < 0.05;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setPlaybackRate(s, user?.id);
                    setIsSpeedModalOpen(false);
                  }}
                  className={`btn-comic text-xs py-1.5 font-bold flex items-center justify-center gap-0.5 ${
                    isSelected ? 'btn-comic-yellow' : ''
                  }`}
                >
                  <span>{s}x</span>
                  {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                </button>
              );
            })}
          </div>

          <div className="card-comic-sm p-2.5 bg-[var(--surface-accent-soft)] text-[11px] text-[var(--ink-primary)] font-bold flex items-center gap-2">
            <Save className="w-4 h-4 shrink-0" strokeWidth={2.25} />
            <span>
              Tốc độ đã chọn ({playbackRate}x) sẽ được giữ nguyên khi bạn nghe truyện khác hoặc đổi tập.
            </span>
          </div>
        </div>
      </Modal>

      {/* Sleep Timer Modal */}
      <Modal
        isOpen={isSleepModalOpen}
        onClose={() => setIsSleepModalOpen(false)}
        title="HẸN GIỜ TẮT NHẠC"
        showFooter={false}
        size="sm"
      >
        <div className="flex flex-col gap-2.5">
          <p className="text-[11px] sm:text-xs text-[var(--ink-secondary)] font-semibold">
            Tự động tạm dừng sau:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[15, 30, 45, 60].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => {
                  setSleepTimer(mins);
                  setIsSleepModalOpen(false);
                  toast.success(`Đã hẹn giờ tắt sau ${mins} phút`);
                }}
                className={`btn-comic text-xs py-2 ${
                  sleepTimerMinutes === mins ? 'btn-comic-yellow' : ''
                }`}
              >
                {mins} phút
              </button>
            ))}
          </div>
          {sleepTimerMinutes && (
            <button
              type="button"
              onClick={() => {
                setSleepTimer(null);
                setIsSleepModalOpen(false);
                toast.info('Đã hủy hẹn giờ tắt');
              }}
              className="btn-comic btn-comic-red text-xs py-2 mt-0.5"
            >
              Hủy hẹn giờ ({sleepTimerMinutes}m)
            </button>
          )}
        </div>
      </Modal>

      {/* Share to Community Modal */}
      <ShareStoryModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        audio={{
          id: audio.id,
          title: audio.title,
          author: audio.author,
          thumbnailUrl: audio.thumbnailUrl,
        }}
      />
    </div>
  );
};
