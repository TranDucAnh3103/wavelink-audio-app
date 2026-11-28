'use client';

import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
  Link2,
  Copy,
  ClipboardPaste,
} from 'lucide-react';
import { useAudio, useToggleFavorite } from '@/hooks/useAudio';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import { PlayerSkeleton } from '@/components/common/Skeletons';
import { Modal } from '@/components/ui/Modal';
import { Slider } from '@/components/ui/Slider';
import { Equalizer } from '@/components/ui/Equalizer';
import { PlaybackSpinner } from '@/components/ui/PlaybackSpinner';
import { formatTime } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { ShareStoryModal } from '@/components/community/ShareStoryModal';
import { RelatedAudiosSection } from '@/components/player/RelatedAudiosSection';
import {
  applyMappedPositionToAudioCache,
  buildYouTubeUrlAtTimestamp,
  getAbsoluteYouTubeSeconds,
  mapAbsoluteSecondsToEpisode,
  parseYouTubeTimeInput,
  parseYouTubeTimestampValue,
  syncAudioToYouTubeTimestamp,
} from '@/lib/youtubeSync';
import { resumeAudioContextOnGesture } from '@/lib/backgroundAudioKeeper';
import { peekLibraryReturnState } from '@/lib/libraryNavigationState';
import { buildAudioSlug, buildPlayerPath, extractAudioIdFromSlug } from '@/lib/slug';
import { AudioItem } from '@/types';

export interface PlayerPageProps {
  initialAudio?: AudioItem | null;
}

export const PlayerPage: React.FC<PlayerPageProps> = ({ initialAudio }) => {
  const { id: rawRouteId } = useParams<{ id: string }>();
  const id = extractAudioIdFromSlug(rawRouteId);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user, isLive } = useAuthStore();

  const { data: fetchedAudio, isLoading, isError, refetch } = useAudio(id, initialAudio);
  const toggleFavoriteMutation = useToggleFavorite();

  const {
    currentAudio,
    currentEpisode,
    isPlaying,
    isBuffering,
    isRetrying,
    retryAttempt,
    playbackError,
    bufferingStartedAt,
    currentTime,
    duration,
    playbackRate,
    sleepTimerMode,
    sleepTimerMinutes,
    sleepTimerEndTimestamp,
    play,
    pause,
    togglePlay,
    retryPlayback,
    seekTo,
    skipSeconds,
    prevEpisode,
    nextEpisode,
    setPlaybackRate,
    setSleepTimer,
    setSleepTimerEndOfEpisode,
    setScreenLocked,
  } = usePlayerStore();

  const playingFallbackAudio =
    currentAudio && id && String(currentAudio.id) === String(id) ? currentAudio : null;
  const audio = fetchedAudio || playingFallbackAudio;

  // Chuẩn hóa URL sang SEO slug (/player/ten-truyen-189) và đồng bộ title/canonical trên client
  React.useEffect(() => {
    if (!audio?.id) return;
    const expectedSlug = buildAudioSlug(audio);
    if (
      rawRouteId &&
      expectedSlug &&
      rawRouteId !== expectedSlug &&
      extractAudioIdFromSlug(rawRouteId) === String(audio.id) &&
      !searchParams.get('t')
    ) {
      const qs = searchParams.toString();
      navigate(buildPlayerPath(audio, qs ? { query: qs } : undefined), { replace: true });
    }
    if (typeof document !== 'undefined' && audio.title) {
      document.title = `${audio.title}${audio.author ? ` - ${audio.author}` : ''} | WaveLink Audio`;
      const canonicalHref = `${window.location.origin}${buildPlayerPath(audio)}`;
      let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!canonicalLink) {
        canonicalLink = document.createElement('link');
        canonicalLink.rel = 'canonical';
        document.head.appendChild(canonicalLink);
      }
      canonicalLink.href = canonicalHref;
    }
  }, [audio?.id, audio?.title, audio?.author, rawRouteId, navigate, searchParams]);

  // Khi quay lại app từ khay ứng dụng / mạng vừa khôi phục, tự đồng bộ lại nếu dữ liệu bị lỗi hoặc chưa đầy đủ
  React.useEffect(() => {
    if (typeof window === 'undefined' || !id) return;
    const handleResumeSync = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (
        typeof refetch === 'function' &&
        (!fetchedAudio || isError || !fetchedAudio.episodes || fetchedAudio.episodes.length === 0)
      ) {
        void refetch();
      }
    };
    document.addEventListener('visibilitychange', handleResumeSync);
    window.addEventListener('online', handleResumeSync);
    return () => {
      document.removeEventListener('visibilitychange', handleResumeSync);
      window.removeEventListener('online', handleResumeSync);
    };
  }, [id, fetchedAudio, isError, refetch]);

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
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [episodeSearch, setEpisodeSearch] = useState('');
  const [isYtSyncModalOpen, setIsYtSyncModalOpen] = useState(false);
  const [ytSyncInput, setYtSyncInput] = useState('');
  const [ytSyncHours, setYtSyncHours] = useState('');
  const [ytSyncMinutes, setYtSyncMinutes] = useState('');
  const [ytSyncSeconds, setYtSyncSeconds] = useState('');
  const [isApplyingYtSync, setIsApplyingYtSync] = useState(false);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number>(0);
  const [customSleepMinutes, setCustomSleepMinutes] = useState('');
  const appliedUrlTimestampKeyRef = React.useRef<string | null>(null);

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
      setActiveTab((prev) => (prev === 'player' ? 'episodes' : 'player'));
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
  const isTargetAudioBuffering = Boolean(isTargetAudioPlaying && isPlaying && isBuffering);
  const [showStuckRetry, setShowStuckRetry] = useState(false);

  React.useEffect(() => {
    if (!isTargetAudioBuffering) {
      setShowStuckRetry(false);
      return;
    }
    if (isRetrying) {
      setShowStuckRetry(true);
      return;
    }
    const started = bufferingStartedAt || Date.now();
    const elapsed = Date.now() - started;
    if (elapsed >= 4000) {
      setShowStuckRetry(true);
      return;
    }
    const timer = setTimeout(() => {
      setShowStuckRetry(true);
    }, Math.max(200, 4000 - elapsed));
    return () => clearTimeout(timer);
  }, [isTargetAudioBuffering, isRetrying, bufferingStartedAt]);

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
    setIsDescriptionExpanded(false);
  }, [audio?.id]);

  React.useEffect(() => {
    if (sleepTimerMode !== 'duration' || !sleepTimerEndTimestamp) {
      setSleepRemainingSec(0);
      return;
    }

    const updateRemaining = () => {
      setSleepRemainingSec(Math.max(0, Math.ceil((sleepTimerEndTimestamp - Date.now()) / 1000)));
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [sleepTimerMode, sleepTimerEndTimestamp]);

  React.useEffect(() => {
    const rawT = searchParams.get('t');
    if (!rawT || !audio?.id || !audio.episodes || audio.episodes.length === 0) return;

    const dedupeKey = `${audio.id}:${rawT}`;
    if (appliedUrlTimestampKeyRef.current === dedupeKey) return;

    const seconds = parseYouTubeTimestampValue(rawT);
    appliedUrlTimestampKeyRef.current = dedupeKey;

    if (seconds !== null && seconds > 0) {
      const mapped = mapAbsoluteSecondsToEpisode(audio, seconds);
      if (mapped) {
        const updatedAudio = applyMappedPositionToAudioCache(audio, mapped);
        queryClient.setQueryData(['audio', id], (old: AudioItem | null | undefined) =>
          old ? applyMappedPositionToAudioCache(old, mapped) : updatedAudio
        );
        setSyncedRecentInfo({
          position: mapped.formattedEpisodePos,
          epNumber: mapped.episode.episodeNumber,
        });
        const epIdx = episodesList.findIndex((ep) => ep.id === mapped.episode.id);
        if (epIdx !== -1) {
          setEpisodePage(Math.floor(epIdx / DEFAULT_PAGE_SIZE) + 1);
        }

        const isVipOrAdm =
          user?.role === 'VIP' || user?.role === 'ADMIN' || user?.membership === 'VIP';
        const epIsVip = Boolean(audio.isVIPOnly || audio.isVipOnly || mapped.episode.isVip);
        const freeLimit = audio.freeEpisodesCount !== undefined ? audio.freeEpisodesCount : 1;
        const locked =
          !isVipOrAdm &&
          epIsVip &&
          (mapped.episode.episodeNumber > freeLimit ||
            freeLimit === 0 ||
            Boolean(mapped.episode.isLocked));

        if (isTargetAudioPlaying && !locked) {
          play(updatedAudio, mapped.episode, mapped.positionSeconds);
        }

        void syncAudioToYouTubeTimestamp(audio, seconds, isLive)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['audio'] });
          })
          .catch(() => {});

        toast.success(
          `Đã đồng bộ từ YouTube (${mapped.formattedAbsolute}) → Tập ${mapped.episode.episodeNumber} (${mapped.formattedEpisodePos})`
        );
      }
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('t');
    setSearchParams(nextParams, { replace: true });
  }, [
    audio,
    episodesList,
    id,
    isLive,
    isTargetAudioPlaying,
    play,
    queryClient,
    searchParams,
    setSearchParams,
    user?.membership,
    user?.role,
  ]);

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
    const ep = currentEpisodeRef.current || audio?.episodes?.[0];
    const epNum = ep?.episodeNumber || audio?.currentEpisodeNumber || 1;
    const epDur = ep?.duration || (ep ? ep.endSeconds - ep.startSeconds : 0) || 14400;
    const pct = Math.min(100, Math.round((cTime / epDur) * 100));

    setSyncedRecentInfo({
      position: formatTime(cTime),
      epNumber: epNum,
    });
    if (audio?.id) {
      if (ep?.id) {
        api.progress
          .updateProgress({
            audioId: audio.id,
            episodeId: ep.id,
            positionSeconds: cTime,
            progressPercent: pct,
            completed: pct >= 95,
          })
          .catch(() => {});
      }
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
    if (isError) {
      return (
        <div className="w-full max-w-lg mx-auto flex flex-col items-center justify-center p-10 text-center gap-4 fade-in-comic">
          <div className="w-16 h-16 rounded-2xl border-2 border-[#111113] bg-[#FFE600] text-[#111113] flex items-center justify-center shadow-comic">
            <RefreshCw className="w-8 h-8" strokeWidth={2.25} />
          </div>
          <h3 className="font-extrabold text-lg text-[var(--ink-primary)] uppercase">
            Mất kết nối tạm thời khi tải audio
          </h3>
          <div className="flex items-center gap-2.5 flex-wrap justify-center">
            <button
              type="button"
              onClick={() => typeof refetch === 'function' && void refetch()}
              className="btn-comic btn-comic-primary text-xs"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Thử tải lại</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/library')}
              className="btn-comic text-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Về Thư Viện</span>
            </button>
          </div>
        </div>
      );
    }

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

  const isEndOfEpisodeSleep = sleepTimerMode === 'end_of_episode';
  const hasActiveSleepTimer = isEndOfEpisodeSleep || Boolean(sleepTimerMinutes);
  const epRemainingAudioSec = Math.max(0, Math.round(episodeDuration - currentPosition));
  const activePlaybackRate = Math.max(0.25, playbackRate || 1);
  const epRemainingWallSec = Math.max(0, Math.round(epRemainingAudioSec / activePlaybackRate));
  const epRemainingAudioLabel = formatTime(epRemainingAudioSec, epRemainingAudioSec >= 3600);
  const epRemainingWallLabel = formatTime(epRemainingWallSec, epRemainingWallSec >= 3600);

  const handleMasterPlay = () => {
    resumeAudioContextOnGesture();
    if (isEpLocked(activeEp)) {
      handleLockedEpisodeAction();
      return;
    }
    if (isTargetAudioPlaying) {
      if (isTargetAudioBuffering && (showStuckRetry || isRetrying)) {
        retryPlayback();
        return;
      }
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
    if (
      targetEp &&
      isTargetAudioPlaying &&
      currentEpisode?.id === targetEp.id &&
      (isTargetAudioBuffering || Boolean(playbackError))
    ) {
      retryPlayback();
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

  const descriptionText = audio.description || '';
  const shouldCollapseDescription =
    descriptionText.length > 160 || descriptionText.split(/\r?\n/).length > 3;

  const absoluteYouTubeSeconds = getAbsoluteYouTubeSeconds(activeEp, currentPosition);
  const formattedAbsoluteYouTube = formatTime(
    absoluteYouTubeSeconds,
    absoluteYouTubeSeconds >= 3600
  );
  const youtubeSyncedUrl = audio.youtubeVideoId
    ? buildYouTubeUrlAtTimestamp(audio.youtubeVideoId, absoluteYouTubeSeconds)
    : '';

  const parsedYtInput = parseYouTubeTimeInput(ytSyncInput);
  const hasManualHms =
    ytSyncHours.trim() !== '' || ytSyncMinutes.trim() !== '' || ytSyncSeconds.trim() !== '';
  const manualHmsTotalSeconds = hasManualHms
    ? Math.max(
        0,
        (Math.max(0, parseInt(ytSyncHours, 10) || 0)) * 3600 +
          (Math.max(0, parseInt(ytSyncMinutes, 10) || 0)) * 60 +
          (Math.max(0, parseInt(ytSyncSeconds, 10) || 0))
      )
    : null;
  const effectiveSyncSeconds =
    parsedYtInput.seconds !== null ? parsedYtInput.seconds : manualHmsTotalSeconds;
  const isMissingTimestampInUrl = Boolean(parsedYtInput.videoId && parsedYtInput.seconds === null);

  const previewYtMapped =
    effectiveSyncSeconds !== null
      ? mapAbsoluteSecondsToEpisode(audio, effectiveSyncSeconds)
      : null;

  const clearYtSyncFields = () => {
    setYtSyncInput('');
    setYtSyncHours('');
    setYtSyncMinutes('');
    setYtSyncSeconds('');
  };

  const handleYtSyncTextChange = (val: string) => {
    setYtSyncInput(val);
    const parsed = parseYouTubeTimeInput(val);
    if (parsed.seconds !== null) {
      setYtSyncHours(String(Math.floor(parsed.seconds / 3600)));
      setYtSyncMinutes(String(Math.floor((parsed.seconds % 3600) / 60)));
      setYtSyncSeconds(String(parsed.seconds % 60));
    } else if (!val.trim()) {
      setYtSyncHours('');
      setYtSyncMinutes('');
      setYtSyncSeconds('');
    }
  };

  const handleHmsFieldChange = (field: 'h' | 'm' | 's', value: string) => {
    if (parsedYtInput.seconds !== null) {
      setYtSyncInput('');
    }
    if (field === 'h') setYtSyncHours(value);
    else if (field === 'm') setYtSyncMinutes(value);
    else setYtSyncSeconds(value);
  };

  const handleOpenYouTubeSynced = () => {
    if (activeEp?.id) {
      Promise.resolve(
        api.progress.updateProgress(
          {
            audioId: audio.id,
            episodeId: activeEp.id,
            positionSeconds: Math.round(currentPosition),
            progressPercent: rawPercent,
            completed: rawPercent >= 95,
          },
          isLive
        )
      ).catch(() => {});
      setSyncedRecentInfo({
        position: formatTime(currentPosition),
        epNumber: activeEp.episodeNumber || 1,
      });
      queryClient.invalidateQueries({ queryKey: ['audio'] });
    }
    if (isTargetAudioPlaying && isPlaying) {
      pause();
    }
  };

  const handleCopySyncedYouTubeUrl = async () => {
    if (!youtubeSyncedUrl) return;
    try {
      await navigator.clipboard.writeText(youtubeSyncedUrl);
      toast.success(`Đã sao chép link YouTube tại ${formattedAbsoluteYouTube}`);
    } catch {
      toast.error('Không sao chép được vào clipboard');
    }
  };

  const handlePasteYtSyncInput = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) handleYtSyncTextChange(text.trim());
    } catch {
      toast.error('Không đọc được clipboard, vui lòng dán thủ công');
    }
  };

  const handleApplyYouTubeSync = async () => {
    if (effectiveSyncSeconds === null) {
      toast.error('Vui lòng nhập mốc thời gian hoặc dán link YouTube có kèm thời gian');
      return;
    }
    setIsApplyingYtSync(true);
    try {
      const mapped = await syncAudioToYouTubeTimestamp(audio, effectiveSyncSeconds, isLive);
      if (!mapped) {
        toast.error('Không tìm thấy danh sách tập để đồng bộ thời gian');
        return;
      }

      const updatedAudio = applyMappedPositionToAudioCache(audio, mapped);
      queryClient.setQueryData(['audio', id], (old: AudioItem | null | undefined) =>
        old ? applyMappedPositionToAudioCache(old, mapped) : updatedAudio
      );
      queryClient.invalidateQueries({ queryKey: ['audio'] });
      setSyncedRecentInfo({
        position: mapped.formattedEpisodePos,
        epNumber: mapped.episode.episodeNumber,
      });

      const epIdx = episodesList.findIndex((ep) => ep.id === mapped.episode.id);
      if (epIdx !== -1) {
        setEpisodePage(Math.floor(epIdx / DEFAULT_PAGE_SIZE) + 1);
      }

      if (isTargetAudioPlaying && !isEpLocked(mapped.episode)) {
        play(updatedAudio, mapped.episode, mapped.positionSeconds);
      }

      setIsYtSyncModalOpen(false);
      clearYtSyncFields();
      toast.success(
        `Đã đồng bộ về Tập ${mapped.episode.episodeNumber} (${mapped.formattedEpisodePos})`
      );
    } catch {
      toast.error('Lỗi khi lưu đồng bộ thời gian YouTube');
    } finally {
      setIsApplyingYtSync(false);
    }
  };

  return (
    <div
      className="w-full max-w-6xl mx-auto px-4 md:px-6 flex flex-col pb-40 md:pb-28 gap-4 fade-in-comic select-none sm:select-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* 1. Top Sub-Bar Navigation */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              navigate(-1);
            } else {
              const saved = peekLibraryReturnState();
              navigate(saved && saved.page > 1 ? `/library?page=${saved.page}` : '/library');
            }
          }}
          className="btn-comic text-xs h-9 px-3 whitespace-nowrap shrink-0"
          aria-label="Quay lại"
        >
          <ChevronLeft className="w-4 h-4 shrink-0" strokeWidth={2.5} />
          <span>Quay lại</span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleShare}
            className="w-9 h-9 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-card)] flex items-center justify-center text-[var(--ink-primary)] shadow-comic-sm hover:bg-[var(--surface-muted)] cursor-pointer"
            title="Chia sẻ"
            aria-label="Chia sẻ audio"
          >
            <Share2 className="w-4 h-4" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={handleToggleFavorite}
            className="w-9 h-9 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-card)] flex items-center justify-center shadow-comic-sm hover:bg-[var(--surface-muted)] cursor-pointer transition-transform"
            title="Yêu thích"
            aria-label="Yêu thích audio"
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
      <div className="grid grid-cols-2 lg:hidden gap-2 w-full">
        <button
          type="button"
          onClick={() => setActiveTab('player')}
          className={`h-10 px-3 rounded-xl border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'player'
              ? 'bg-[#FFE600] text-[#111113] border-[#111113] shadow-comic-sm'
              : 'bg-[var(--surface-card)] border-[var(--border-ink)] text-[var(--ink-secondary)] hover:bg-[var(--surface-muted)]'
          }`}
        >
          <Headphones className="w-4 h-4 shrink-0" strokeWidth={2.25} />
          <span>Trình Phát</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('episodes')}
          className={`h-10 px-3 rounded-xl border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'episodes'
              ? 'bg-[#FFE600] text-[#111113] border-[#111113] shadow-comic-sm'
              : 'bg-[var(--surface-card)] border-[var(--border-ink)] text-[var(--ink-secondary)] hover:bg-[var(--surface-muted)]'
          }`}
        >
          <ListMusic className="w-4 h-4 shrink-0" strokeWidth={2.25} />
          <span>Danh Sách Tập</span>
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
          {/* 1. Compact Header Card: Cover, Title, Concise Inline Meta */}
          <div className="card-comic p-3.5 md:p-5 flex flex-col gap-3 relative">
            <div className="relative w-full aspect-[21/9] sm:aspect-[16/9] max-h-40 sm:max-h-56 rounded-xl border-2 border-[var(--border-ink)] overflow-hidden bg-[#111113] flex items-center justify-center shadow-comic-sm">
              <img
                className="w-full h-full object-cover"
                src={audio.thumbnailUrl || '/wavelink-icon.png'}
                alt={audio.title}
                width={640}
                height={360}
                {...({ fetchpriority: 'high' } as Record<string, string>)}
                decoding="sync"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />

              <div className="absolute top-2 right-2 z-10">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide backdrop-blur-sm ${
                    isTargetAudioBuffering
                      ? 'bg-[#FFE600] text-[#111113]'
                      : isTargetAudioPlaying && isPlaying
                        ? 'bg-[#E63946] text-white'
                        : 'bg-black/60 text-white'
                  }`}
                >
                  {isTargetAudioBuffering
                    ? isRetrying
                      ? `● THỬ LẠI (${retryAttempt || 1})`
                      : '● ĐANG TẢI...'
                    : isTargetAudioPlaying && isPlaying
                      ? '● ĐANG PHÁT'
                      : 'SẴN SÀNG'}
                </span>
              </div>

              <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-white z-10">
                <span className="px-2 py-0.5 rounded-md bg-[#FFE600] text-[#111113] font-mono text-[10px] font-black shadow-sm">
                  TẬP {String(activeEp.episodeNumber || 1).padStart(2, '0')} · {currentPercent}%
                </span>
                {(audio.isVIPOnly || audio.isVipOnly) && (
                  <span className="px-2 py-0.5 rounded-md bg-[#8338EC] text-white text-[10px] font-black inline-flex items-center gap-1">
                    <Crown className="w-3 h-3" strokeWidth={2.5} /> VIP
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <h1 className="font-extrabold text-base sm:text-xl text-[var(--ink-primary)] leading-snug line-clamp-2">
                {audio.title}
              </h1>

              {/* Plain-text metadata strip without heavy pill borders */}
              <div className="flex items-center gap-x-2 gap-y-1 flex-wrap text-xs font-semibold text-[var(--ink-secondary)]">
                <span className="text-[#3A86FF] font-extrabold">{audio.categoryName || 'Chung'}</span>
                <span aria-hidden="true">·</span>
                <span>{audio.totalEpisodes || audio.episodes?.length || 1} tập</span>
                <span aria-hidden="true">·</span>
                <span>{audio.formattedDuration || '24h 00m'}</span>
                {audio.viewCount !== undefined && audio.viewCount !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Eye className="w-3 h-3" strokeWidth={2.25} />
                      {Number(audio.viewCount).toLocaleString('vi-VN')}
                    </span>
                  </>
                )}
              </div>

              {/* Author + subtle borderless utility links */}
              <div className="flex items-center justify-between gap-2 pt-1 flex-wrap text-xs">
                <span className="font-semibold text-[var(--ink-secondary)] truncate">
                  Tác giả: <strong className="text-[var(--ink-primary)]">{audio.author || 'Chưa rõ'}</strong>
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    data-testid="open-yt-sync-btn"
                    onClick={() => setIsYtSyncModalOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--ink-secondary)] hover:text-[#3A86FF] transition-colors cursor-pointer whitespace-nowrap"
                    title="Đồng bộ mốc thời gian nghe hai chiều giữa YouTube và WaveLink"
                  >
                    <Link2 className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />
                    <span>Đồng bộ YT</span>
                  </button>
                  {audio.youtubeVideoId && (
                    <a
                      data-testid="open-youtube-synced-link"
                      href={youtubeSyncedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleOpenYouTubeSynced}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#E63946] hover:underline whitespace-nowrap"
                      title={
                        absoluteYouTubeSeconds > 0
                          ? `Mở trên YouTube tại ${formattedAbsoluteYouTube} (tự động đồng bộ mốc nghe)`
                          : 'Mở video gốc trên YouTube'
                      }
                    >
                      <Youtube className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />
                      <span>
                        YouTube{absoluteYouTubeSeconds > 0 ? ` · ${formattedAbsoluteYouTube}` : ''}
                      </span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Main Playback Console (Centered Hero Play Control right above the fold) */}
          <div className="card-comic p-4 md:p-5 flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-2 text-xs pb-2 border-b border-[var(--border-ink)]/15">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Equalizer isPlaying={isTargetAudioPlaying && isPlaying} />
                <span className="font-extrabold text-[var(--ink-primary)] truncate">
                  {activeEp.title}
                </span>
              </div>
              <button
                type="button"
                onClick={handleManualSyncRecent}
                className="text-[11px] font-mono font-bold text-[#2A9D8F] hover:underline active:scale-95 transition-all flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer"
                title="Chạm để đồng bộ mốc nghe ngay"
              >
                <RefreshCw
                  className={`w-3 h-3 shrink-0 ${isTargetAudioPlaying && isPlaying ? 'animate-spin' : ''}`}
                  strokeWidth={2.5}
                />
                <span>SYNC: {syncCountdown}s</span>
              </button>
            </div>

            {/* Scrub Bar */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex-1 min-w-0"
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
                  data-testid="toggle-seek-lock-btn"
                  onClick={toggleSeekLock}
                  aria-pressed={isSeekLocked}
                  aria-label={
                    isSeekLocked ? 'Mở khóa thanh tiến trình phát' : 'Khóa thanh tiến trình phát'
                  }
                  title={
                    isSeekLocked
                      ? 'Mở khóa thanh tiến trình phát'
                      : 'Khóa thanh tiến trình phát chống chạm nhầm'
                  }
                  className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all shadow-comic-sm cursor-pointer ${
                    isSeekLocked
                      ? 'bg-[#E63946] text-white border-[#111113]'
                      : 'border-[var(--border-ink)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[#FFE600] hover:text-[#111113]'
                  }`}
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
                  className={`text-[10px] font-mono font-extrabold ${
                    isSeekLocked ? 'text-[#E63946]' : 'text-[var(--ink-muted)]'
                  }`}
                >
                  {isSeekLocked ? 'ĐÃ KHÓA TUA' : `${currentPercent}%`}
                </span>
                <span>{formatTime(episodeDuration)}</span>
              </div>
            </div>

            {/* Hàng 3 nút chính nổi bật: Hẹn giờ ngủ, PLAY CHÍNH, Khóa màn hình */}
            <div
              data-testid="player-lower-controls"
              className="flex items-center justify-center gap-7 py-1"
            >
              <button
                type="button"
                onClick={() => setIsSleepModalOpen(true)}
                className={`relative w-11 h-11 rounded-full border ${
                  hasActiveSleepTimer
                    ? 'bg-[#FFE600] text-[#111113] border-[#111113]'
                    : 'bg-[var(--surface-elevated)] text-[var(--ink-secondary)] border-[var(--border-ink)]/25 hover:text-[var(--ink-primary)]'
                } flex items-center justify-center hover:bg-[var(--surface-muted)] cursor-pointer transition-colors`}
                title={
                  isEndOfEpisodeSleep
                    ? `Hẹn giờ tắt: hết Tập ${activeEp.episodeNumber} (còn ${epRemainingAudioLabel} audio${
                        activePlaybackRate !== 1
                          ? `, ~${epRemainingWallLabel} ở ${activePlaybackRate}x`
                          : ''
                      })`
                    : sleepRemainingSec > 0
                      ? `Hẹn giờ tắt: còn ${formatTime(sleepRemainingSec, sleepRemainingSec >= 3600)}`
                      : 'Hẹn giờ tắt'
                }
                aria-label="Chọn giờ ngủ"
              >
                <Moon className="w-5 h-5" strokeWidth={2.25} />
                {(isEndOfEpisodeSleep || sleepRemainingSec > 0) && (
                  <span
                    data-testid="sleep-timer-countdown-badge"
                    className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full border border-[#111113] bg-[#E63946] text-white font-mono text-[9px] font-black leading-none shadow-comic-sm whitespace-nowrap"
                  >
                    {isEndOfEpisodeSleep
                      ? `Hết T${activeEp.episodeNumber}`
                      : formatTime(sleepRemainingSec, sleepRemainingSec >= 3600)}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={handleMasterPlay}
                aria-busy={isTargetAudioBuffering}
                className={`w-16 h-16 rounded-full border-2 border-[#111113] ${
                  isTargetAudioPlaying && isPlaying
                    ? 'bg-[#FFE600] text-[#111113]'
                    : 'bg-[#3A86FF] text-white'
                } flex items-center justify-center shadow-comic hover:scale-105 active:translate-y-0.5 transition-all cursor-pointer`}
                title={
                  isTargetAudioBuffering
                    ? 'Đang tải âm thanh (Chạm để thử lại)'
                    : isTargetAudioPlaying && isPlaying
                      ? 'Tạm dừng'
                      : 'Phát'
                }
                aria-label={
                  isTargetAudioBuffering
                    ? 'Đang tải âm thanh'
                    : isTargetAudioPlaying && isPlaying
                      ? 'Tạm dừng'
                      : 'Phát'
                }
              >
                {isTargetAudioBuffering ? (
                  <PlaybackSpinner
                    size={28}
                    thickness={3.5}
                    color="#111113"
                    trackColor="rgba(17, 17, 19, 0.2)"
                    label="Đang tải âm thanh"
                  />
                ) : isTargetAudioPlaying && isPlaying ? (
                  <Pause className="w-8 h-8 fill-current" strokeWidth={2.5} />
                ) : (
                  <Play className="w-8 h-8 fill-current ml-0.5" strokeWidth={2.5} />
                )}
              </button>

              <button
                type="button"
                onClick={() => setScreenLocked(true)}
                className="w-11 h-11 rounded-full border border-[var(--border-ink)]/25 bg-[var(--surface-elevated)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] flex items-center justify-center hover:bg-[#FFE600] cursor-pointer transition-colors"
                title="Giữ màn hình / Khóa màn hình (Tránh chạm nhầm)"
                aria-label="Khóa màn hình"
              >
                <Lock className="w-5 h-5" strokeWidth={2.25} />
              </button>
            </div>

            {/* Hàng 4 nút điều chỉnh phụ nhẹ nhàng (không viền dày lấn át nút Play) */}
            {(() => {
              const activeEpIndex = episodesList.findIndex((e) => e.id === activeEp.id);
              const upcomingEp =
                activeEpIndex !== -1 && activeEpIndex + 1 < episodesList.length
                  ? episodesList[activeEpIndex + 1]
                  : null;
              return (
                <div
                  data-testid="player-upper-controls"
                  className="grid grid-cols-4 gap-1.5 pt-2 border-t border-[var(--border-ink)]/15"
                >
                  <button
                    type="button"
                    onClick={() => setIsSpeedModalOpen(true)}
                    className="h-9 px-2 rounded-lg text-[11px] sm:text-xs font-extrabold flex items-center justify-center gap-1 whitespace-nowrap bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[#FFE600] hover:text-[#111113] transition-colors cursor-pointer"
                    title="Chọn tốc độ phát (x1, x1.5, x2...)"
                  >
                    <Gauge className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />
                    <span>{playbackRate}x</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isTargetAudioPlaying) skipSeconds(-10);
                      else play(audio, activeEp, Math.max(0, currentPosition - 10));
                    }}
                    className="h-9 px-2 rounded-lg text-[11px] sm:text-xs font-extrabold flex items-center justify-center gap-1 whitespace-nowrap bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                    title="Tua lùi 10s"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />
                    <span>-10s</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isTargetAudioPlaying) skipSeconds(10);
                      else play(audio, activeEp, currentPosition + 10);
                    }}
                    className="h-9 px-2 rounded-lg text-[11px] sm:text-xs font-extrabold flex items-center justify-center gap-1 whitespace-nowrap bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                    title="Tua tới 10s"
                  >
                    <RotateCw className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />
                    <span>+10s</span>
                  </button>

                  <button
                    type="button"
                    data-testid="player-next-episode-btn"
                    disabled={!upcomingEp}
                    onClick={() => {
                      if (!upcomingEp) return;
                      if (isEpLocked(upcomingEp)) {
                        handleLockedEpisodeAction(
                          'Tập tiếp theo chỉ dành riêng cho thành viên VIP. Vui lòng nâng cấp gói!'
                        );
                        return;
                      }
                      if (isTargetAudioPlaying) {
                        nextEpisode();
                      } else {
                        play(audio, upcomingEp, 0);
                      }
                    }}
                    className="h-9 px-2 rounded-lg text-[11px] sm:text-xs font-extrabold flex items-center justify-center gap-1 whitespace-nowrap bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[#FFE600] hover:text-[#111113] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title={upcomingEp ? `Chuyển sang Tập ${upcomingEp.episodeNumber}` : 'Đã ở tập cuối'}
                    aria-label="Chuyển tập tiếp theo"
                  >
                    <SkipForward className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />
                    <span>Tập sau</span>
                  </button>
                </div>
              );
            })()}

            {(isTargetAudioBuffering && showStuckRetry) || (isTargetAudioPlaying && playbackError) ? (
              <div className="flex items-center justify-center gap-2 pt-1 fade-in-comic">
                <span className="text-[11px] font-bold text-[var(--ink-secondary)]">
                  {playbackError
                    ? playbackError
                    : isRetrying
                      ? `Đang thử kết nối lại (lần ${retryAttempt || 1})...`
                      : 'Đang tải luồng âm thanh...'}
                </span>
                <button
                  type="button"
                  data-testid="player-retry-btn"
                  onClick={() => retryPlayback()}
                  className="btn-comic btn-comic-yellow text-[11px] py-1 px-2.5 font-black shrink-0"
                >
                  <RefreshCw className="w-3 h-3" strokeWidth={2.5} />
                  <span>Thử lại</span>
                </button>
              </div>
            ) : null}
          </div>

          {/* 3. Thông tin bổ sung: Mốc nghe gần nhất, Mô tả & Thẻ (borderless, không làm xao nhãn nút Phát chính) */}
          <div className="card-comic p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-ink)]/15">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <History className="w-4 h-4 text-[var(--ink-secondary)] shrink-0" strokeWidth={2.25} />
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold uppercase text-[var(--ink-muted)]">
                    Mốc nghe gần nhất
                  </span>
                  <span className="text-xs font-bold text-[var(--ink-primary)] truncate">
                    {syncedRecentInfo?.position ||
                      (isTargetAudioPlaying && currentTime > 0
                        ? formatTime(currentTime)
                        : audio.formattedPosition || '00:00:00')}{' '}
                    · Tập{' '}
                    {syncedRecentInfo?.epNumber ||
                      (isTargetAudioPlaying && currentEpisode
                        ? currentEpisode.episodeNumber
                        : audio.currentEpisodeNumber || 1)}{' '}
                    <span className="text-[10px] font-mono text-[var(--ink-secondary)]">
                      ({currentPercent}%{absoluteYouTubeSeconds > 0 ? ` · YT ${formattedAbsoluteYouTube}` : ''})
                    </span>
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResumeShortcut}
                className="px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] hover:bg-[#FFE600] hover:text-[#111113] text-[11px] font-extrabold text-[#3A86FF] inline-flex items-center gap-1 shrink-0 whitespace-nowrap transition-colors cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current shrink-0" strokeWidth={2.25} />
                <span>Nghe tiếp</span>
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-extrabold text-[var(--ink-primary)] uppercase">
                Mô tả video
              </span>
              <div
                className={`whitespace-pre-line text-xs sm:text-sm text-[var(--ink-secondary)] leading-relaxed break-words ${
                  shouldCollapseDescription && !isDescriptionExpanded ? 'line-clamp-3' : ''
                }`}
              >
                {descriptionText ? (
                  descriptionText
                ) : (
                  <span className="italic text-[var(--ink-muted)]">
                    Không có mô tả cho audio này.
                  </span>
                )}
              </div>
              {shouldCollapseDescription && (
                <button
                  type="button"
                  data-testid="toggle-description-btn"
                  aria-expanded={isDescriptionExpanded}
                  onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                  className="self-start inline-flex items-center gap-1 pt-0.5 text-[11px] font-extrabold text-[#3A86FF] hover:underline cursor-pointer"
                >
                  {isDescriptionExpanded ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                      <span>Thu gọn mô tả</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                      <span>Xem thêm mô tả</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {normalizedTags.length > 0 && (
              <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap pt-2 border-t border-[var(--border-ink)]/15 text-[11px]">
                <span className="font-bold text-[var(--ink-muted)] inline-flex items-center gap-1">
                  <Tag className="w-3 h-3 text-[#3A86FF]" strokeWidth={2.25} />
                  <span>Thẻ gắn ({normalizedTags.length}):</span>
                </span>
                {normalizedTags.map((tagName) => (
                  <button
                    key={tagName}
                    type="button"
                    onClick={() => navigate(`/library?search=${encodeURIComponent(tagName)}`)}
                    className="font-bold text-[var(--ink-secondary)] hover:text-[#3A86FF] hover:underline cursor-pointer"
                  >
                    #{tagName}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Episodes List (Always visible on Desktop, Tab 2 on Mobile) */}
        <div
          className={`lg:col-span-5 card-comic p-4 flex-col gap-3 fade-in-comic lg:sticky lg:top-20 ${
            activeTab === 'episodes' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div className="flex items-center justify-between pb-2.5 border-b-2 border-[var(--border-ink)] gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-extrabold text-base uppercase text-[var(--ink-primary)] truncate">
                Danh sách tập
              </h3>
              <span className="badge-comic badge-comic-yellow text-[10px] font-black shrink-0">
                {audio.episodes?.length || 0} tập
              </span>
            </div>
            <button
              type="button"
              onClick={handleRefreshMetadata}
              disabled={isRefreshing}
              className="btn-comic text-[11px] h-8 px-2.5 shrink-0 whitespace-nowrap"
              title="Đồng bộ lại thông tin từ YouTube"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
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
            <div
              data-testid="episode-list-container"
              className="flex flex-col gap-2.5 lg:max-h-[62vh] lg:overflow-y-auto pr-1.5 pb-1"
            >
              {pagedEpisodes.map((ep) => {
                const isThisEpActive = isTargetAudioPlaying && currentEpisode?.id === ep.id;
                const epDuration =
                  ep.duration || Math.max(1, ep.endSeconds - ep.startSeconds) || 14400;
                const liveEpPercent = isThisEpActive
                  ? Math.min(100, Math.round((currentTime / epDuration) * 100))
                  : Math.min(100, Math.round(ep.progressPercent || 0));
                const isCompleted = ep.completed || liveEpPercent >= 95;
                const epLocked = isEpLocked(ep);
                const epIsVip = isVipAudio || Boolean(ep.isVip);
                const hasTimeInTitle = /\([^)]*[-–][^)]*\)/.test(ep.title || '');
                const epDisplayTitle =
                  hasTimeInTitle || ep.endSeconds <= ep.startSeconds
                    ? ep.title
                    : `${ep.title} (${formatTime(ep.startSeconds, ep.endSeconds >= 3600)} - ${formatTime(ep.endSeconds, ep.endSeconds >= 3600)})`;

                return (
                  <div
                    key={ep.id}
                    data-testid={`episode-card-${ep.episodeNumber}`}
                    onClick={() => {
                      if (epLocked) {
                        handleLockedEpisodeAction();
                        return;
                      }
                      if (isThisEpActive && (isTargetAudioBuffering || Boolean(playbackError))) {
                        retryPlayback();
                        return;
                      }
                      play(audio, ep, ep.positionSeconds || 0);
                    }}
                    className={`card-comic-sm shrink-0 relative overflow-hidden px-3 py-2.5 min-h-[58px] flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      epLocked
                        ? 'bg-[#8338EC]/10 border-[#8338EC]/50 opacity-90 hover:bg-[#8338EC]/15'
                        : isThisEpActive
                          ? 'bg-[var(--surface-accent-soft)] !border-2 !border-[#FFE600] shadow-comic-sm'
                          : 'bg-[var(--surface-elevated)] hover:bg-[var(--surface-muted)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
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
                        ) : isThisEpActive && isTargetAudioBuffering ? (
                          <PlaybackSpinner
                            size={16}
                            thickness={2.5}
                            color="#111113"
                            trackColor="rgba(17, 17, 19, 0.2)"
                          />
                        ) : isThisEpActive ? (
                          <Play className="w-4 h-4 fill-current" strokeWidth={2.5} />
                        ) : isCompleted ? (
                          <Check className="w-4 h-4" strokeWidth={3} />
                        ) : (
                          `T${ep.episodeNumber}`
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                        <span className="font-extrabold text-xs sm:text-[13px] text-[var(--ink-primary)] leading-snug break-words">
                          {epDisplayTitle}
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
                    </div>

                    <span
                      data-testid={`episode-status-badge-${ep.episodeNumber}`}
                      className={`badge-comic shrink-0 ${
                        epLocked
                          ? 'badge-comic-purple'
                          : isThisEpActive
                            ? 'badge-comic-yellow'
                            : isCompleted
                              ? 'badge-comic-teal'
                              : liveEpPercent > 0
                                ? 'badge-comic-blue'
                                : 'badge-comic-white'
                      } text-[9px] font-mono`}
                    >
                      {epLocked ? (
                        <span className="flex items-center gap-0.5">
                          <Lock className="w-2.5 h-2.5" /> KHÓA VIP
                        </span>
                      ) : isThisEpActive ? (
                        `${liveEpPercent}%`
                      ) : isCompleted ? (
                        'ĐÃ XONG'
                      ) : liveEpPercent > 0 ? (
                        `ĐÃ NGHE ${liveEpPercent}%`
                      ) : (
                        'CHƯA NGHE'
                      )}
                    </span>

                    {!epLocked && liveEpPercent > 0 && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-0 inset-x-0 h-[3px] bg-[var(--surface-muted)]"
                      >
                        <div
                          className={`h-full transition-all duration-300 ${
                            isCompleted ? 'bg-[#2A9D8F]' : 'bg-[#3A86FF]'
                          }`}
                          style={{ width: `${liveEpPercent}%` }}
                        />
                      </div>
                    )}
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

      {/* Audio liên quan ở cuối trang Player */}
      <RelatedAudiosSection currentAudio={audio} />

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
        <div className="flex flex-col gap-3">
          {(isEndOfEpisodeSleep || sleepRemainingSec > 0) && (
            <div
              data-testid="sleep-modal-countdown"
              className="card-comic-sm p-2.5 bg-[#FFFBEB] dark:bg-[#2F2614] border-2 border-[#111113] flex items-center justify-between gap-2 text-xs font-bold text-[var(--ink-primary)]"
            >
              <span>
                {isEndOfEpisodeSleep
                  ? `Tắt khi hết Tập ${activeEp.episodeNumber}:`
                  : 'Đang đếm ngược tắt nhạc:'}
              </span>
              <div className="text-right">
                <strong className="font-mono text-sm text-[#E63946]">
                  {isEndOfEpisodeSleep
                    ? epRemainingAudioLabel
                    : formatTime(sleepRemainingSec, sleepRemainingSec >= 3600)}
                </strong>
                {isEndOfEpisodeSleep && activePlaybackRate !== 1 && (
                  <div className="text-[10px] font-semibold text-[var(--ink-secondary)] font-mono">
                    ~{epRemainingWallLabel} ở {activePlaybackRate}x
                  </div>
                )}
              </div>
            </div>
          )}

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
                  sleepTimerMode === 'duration' && sleepTimerMinutes === mins
                    ? 'btn-comic-yellow'
                    : ''
                }`}
              >
                {mins} phút
              </button>
            ))}
          </div>

          <button
            type="button"
            data-testid="sleep-end-of-episode-btn"
            onClick={() => {
              setSleepTimerEndOfEpisode();
              setIsSleepModalOpen(false);
              const speedSuffix =
                activePlaybackRate !== 1
                  ? ` · ~${epRemainingWallLabel} ở ${activePlaybackRate}x`
                  : '';
              toast.success(
                `Đã hẹn giờ tắt khi hết Tập ${activeEp.episodeNumber} (còn ${epRemainingAudioLabel}${speedSuffix})`
              );
            }}
            className={`btn-comic text-xs py-2 font-bold justify-center ${
              isEndOfEpisodeSleep
                ? 'btn-comic-yellow'
                : 'bg-[var(--surface-accent-soft)] hover:bg-[#FFE600] hover:text-[#111113]'
            }`}
          >
            Hết tập hiện tại (Tập {activeEp.episodeNumber} · {epRemainingAudioLabel}
            {activePlaybackRate !== 1 ? ` · ~${epRemainingWallLabel} ở ${activePlaybackRate}x` : ''})
          </button>

          <div className="flex items-center gap-2 pt-1 border-t border-[var(--border-ink)]/15">
            <input
              data-testid="custom-sleep-minutes-input"
              type="number"
              min={1}
              max={480}
              value={customSleepMinutes}
              onChange={(e) => setCustomSleepMinutes(e.target.value)}
              placeholder="Số phút tùy chỉnh (1-480)..."
              className="input-comic text-xs font-mono flex-1 py-1.5 px-2.5"
            />
            <button
              type="button"
              data-testid="apply-custom-sleep-btn"
              onClick={() => {
                const mins = parseInt(customSleepMinutes, 10);
                if (!Number.isFinite(mins) || mins < 1 || mins > 480) {
                  toast.error('Vui lòng nhập số phút từ 1 đến 480');
                  return;
                }
                setSleepTimer(mins);
                setCustomSleepMinutes('');
                setIsSleepModalOpen(false);
                toast.success(`Đã hẹn giờ tắt sau ${mins} phút`);
              }}
              className="btn-comic btn-comic-yellow text-xs py-1.5 px-3 font-black shrink-0"
            >
              Đặt
            </button>
          </div>

          {hasActiveSleepTimer && (
            <button
              type="button"
              onClick={() => {
                setSleepTimer(null);
                setIsSleepModalOpen(false);
                toast.info('Đã hủy hẹn giờ tắt');
              }}
              className="btn-comic btn-comic-red text-xs py-2 mt-0.5"
            >
              Hủy hẹn giờ (
              {isEndOfEpisodeSleep
                ? `Hết Tập ${activeEp.episodeNumber}`
                : sleepRemainingSec > 0
                  ? formatTime(sleepRemainingSec, sleepRemainingSec >= 3600)
                  : `${sleepTimerMinutes}m`}
              )
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

      {/* YouTube Bidirectional Timestamp Sync Modal */}
      <Modal
        isOpen={isYtSyncModalOpen}
        onClose={() => {
          setIsYtSyncModalOpen(false);
          clearYtSyncFields();
        }}
        title="ĐỒNG BỘ THỜI GIAN YOUTUBE"
        showFooter={false}
        size="sm"
      >
        <div className="flex flex-col gap-3">
          <div className="card-comic-sm p-3 bg-[var(--surface-accent-soft)] flex flex-col gap-2">
            <span className="text-[11px] font-extrabold uppercase text-[var(--ink-secondary)]">
              Mốc đang nghe trên app
            </span>
            <div className="text-xs font-bold text-[var(--ink-primary)]">
              Tập {activeEp.episodeNumber} · {formatTime(currentPosition)} = Tổng YouTube:{' '}
              <span className="font-mono text-[#E63946]">{formattedAbsoluteYouTube}</span>
            </div>
            {youtubeSyncedUrl && (
              <button
                type="button"
                onClick={handleCopySyncedYouTubeUrl}
                className="btn-comic btn-comic-yellow text-[11px] py-1.5 px-2.5 self-start font-extrabold"
              >
                <Copy className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />
                <span>Sao chép link YT tại mốc này</span>
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="yt-sync-input"
              className="text-[11px] font-extrabold uppercase text-[var(--ink-primary)]"
            >
              Cách 1: Dán link YouTube có kèm ?t=...
            </label>
            <div className="flex items-center gap-2">
              <input
                id="yt-sync-input"
                data-testid="yt-sync-input"
                type="text"
                value={ytSyncInput}
                onChange={(e) => handleYtSyncTextChange(e.target.value)}
                placeholder="https://youtube.com/watch?v=...&t=02:31:12"
                className="input-comic text-xs font-mono flex-1 py-2 px-3"
              />
              <button
                type="button"
                onClick={handlePasteYtSyncInput}
                className="btn-comic text-xs py-2 px-2.5 shrink-0"
                title="Dán từ clipboard"
              >
                <ClipboardPaste className="w-3.5 h-3.5" strokeWidth={2.25} />
              </button>
            </div>
          </div>

          {isMissingTimestampInUrl && (
            <div
              data-testid="yt-sync-missing-time-hint"
              className="card-comic-sm p-2.5 bg-[#FFFBEB] dark:bg-[#2F2614] border-2 border-[#F59E0B] text-[11px] font-bold text-[#92400E] dark:text-[#FCD34D] leading-snug"
            >
              Link chia sẻ mặc định của YouTube (<code>?si=...</code>) không kèm mốc thời gian.
              Hãy gõ thẳng <strong>Giờ / Phút / Giây</strong> đang xem bên dưới (hoặc trên máy tính:
              chuột phải video → <em>Sao chép URL tại thời điểm hiện tại</em>).
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-extrabold uppercase text-[var(--ink-primary)]">
              Cách 2: Nhập nhanh Giờ / Phút / Giây từ YouTube
            </span>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-0.5 text-[10px] font-bold text-[var(--ink-secondary)]">
                <span>Giờ</span>
                <input
                  data-testid="yt-sync-hours"
                  type="number"
                  min={0}
                  max={99}
                  value={ytSyncHours}
                  onChange={(e) => handleHmsFieldChange('h', e.target.value)}
                  placeholder="0"
                  className="input-comic text-xs font-mono text-center py-1.5 px-2"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px] font-bold text-[var(--ink-secondary)]">
                <span>Phút</span>
                <input
                  data-testid="yt-sync-minutes"
                  type="number"
                  min={0}
                  max={59}
                  value={ytSyncMinutes}
                  onChange={(e) => handleHmsFieldChange('m', e.target.value)}
                  placeholder="00"
                  className="input-comic text-xs font-mono text-center py-1.5 px-2"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px] font-bold text-[var(--ink-secondary)]">
                <span>Giây</span>
                <input
                  data-testid="yt-sync-seconds"
                  type="number"
                  min={0}
                  max={59}
                  value={ytSyncSeconds}
                  onChange={(e) => handleHmsFieldChange('s', e.target.value)}
                  placeholder="00"
                  className="input-comic text-xs font-mono text-center py-1.5 px-2"
                />
              </label>
            </div>
          </div>

          {parsedYtInput.videoId &&
            audio.youtubeVideoId &&
            parsedYtInput.videoId !== audio.youtubeVideoId && (
              <div className="card-comic-sm p-2.5 bg-[#FFFBEB] dark:bg-[#2F2614] border-2 border-[#F59E0B] text-[11px] font-bold text-[#92400E] dark:text-[#FCD34D]">
                Lưu ý: Link vừa dán thuộc video YouTube khác ({parsedYtInput.videoId}), nhưng vẫn
                có thể áp dụng mốc thời gian nếu đúng phần truyện.
              </div>
            )}

          {previewYtMapped && (
            <div
              data-testid="yt-sync-preview"
              className="card-comic-sm p-2.5 bg-[var(--surface-elevated)] border-2 border-[#2A9D8F] text-xs font-bold text-[var(--ink-primary)]"
            >
              → Sẽ đồng bộ về <strong>Tập {previewYtMapped.episode.episodeNumber}</strong> ·{' '}
              <span className="font-mono">{previewYtMapped.formattedEpisodePos}</span> (
              {previewYtMapped.progressPercent}%)
            </div>
          )}

          <button
            type="button"
            data-testid="apply-yt-sync-btn"
            disabled={effectiveSyncSeconds === null || isApplyingYtSync}
            onClick={handleApplyYouTubeSync}
            className="btn-comic btn-comic-primary text-xs py-2.5 font-black w-full justify-center disabled:opacity-50"
          >
            {isApplyingYtSync ? 'Đang đồng bộ...' : 'Áp dụng & Lưu Mốc Nghe'}
          </button>
        </div>
      </Modal>
    </div>
  );
};
