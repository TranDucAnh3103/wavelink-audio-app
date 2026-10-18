import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAudio, useToggleFavorite } from '@/hooks/useAudio';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import { LoadingState } from '@/components/common/LoadingState';
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


export const PlayerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data: audio, isLoading } = useAudio(id);
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

  const isTargetAudioPlaying = Boolean(audio && currentAudio && String(currentAudio.id) === String(audio.id));

  const currentTimeRef = React.useRef(currentTime);
  currentTimeRef.current = currentTime;
  const currentEpisodeRef = React.useRef(currentEpisode);
  currentEpisodeRef.current = currentEpisode;

  // Đồng bộ trạng thái yêu thích từ query khi dữ liệu audio cập nhật
  React.useEffect(() => {
    setOptimisticFavorite(null);
  }, [audio?.id, audio?.isFavorite]);

  // 1. Tự động đồng bộ mốc nghe gần nhất và đếm ngược SYNC 60S (từ 60 về 0) khi đang phát audio này
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

  const handleManualSyncRecent = () => {
    const cTime = currentTimeRef.current > 0 ? currentTimeRef.current : (audio?.lastPositionSeconds || 0);
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

  if (isLoading) {
    return <PlayerSkeleton />;
  }

  if (!audio) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center gap-3 fade-in-comic">
        <div className="w-16 h-16 rounded-full border-2 border-black bg-[#FFE600] flex items-center justify-center shadow-comic">
          <i className="ri-disc-line text-3xl text-black" />
        </div>
        <h3 className="font-extrabold text-lg text-black uppercase">Không tìm thấy bản ghi audio</h3>
        <button onClick={() => navigate('/library')} className="btn-comic btn-comic-primary text-xs">
          <i className="ri-arrow-left-line" /> Về Thư Viện
        </button>
      </div>
    );
  }

  const isVipOrAdmin = user?.role === 'VIP' || user?.role === 'ADMIN' || user?.membership === 'VIP';
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
      toast.error(customMsg || 'Tập 2 trở đi chỉ dành riêng cho thành viên VIP. Vui lòng nâng cấp gói để tiếp tục nghe!');
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

  const episodeDuration = activeEp.duration || activeEp.endSeconds - activeEp.startSeconds || 14400;
  const currentPosition = isTargetAudioPlaying ? currentTime : audio.lastPositionSeconds || 0;
  const rawPercent = Math.min(100, Math.round((currentPosition / episodeDuration) * 100));
  const currentPercent = scrubPercent !== null ? scrubPercent : rawPercent;

  const handleMasterPlay = () => {
    // iOS Safari: AudioContext phải được resume trong user gesture event
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
    <div className="flex flex-col w-full pb-36 px-4 gap-4 fade-in-comic">
      {/* 1. Top Sub-Bar Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button onClick={() => navigate(-1)} className="btn-comic text-xs py-1.5 px-3 bg-white" aria-label="Quay lại">
          <i className="ri-arrow-left-s-line text-base font-bold" /> Quay lại
        </button>

        <div className="badge-comic badge-comic-yellow text-xs font-black">
          <i className="ri-headphone-fill" /> WAVELINK PLAYER
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="w-8 h-8 rounded-lg border-2 border-black bg-white flex items-center justify-center shadow-comic-sm hover:bg-gray-100 active:translate-x-0.5 active:translate-y-0.5"
            title="Chia sẻ"
          >
            <i className="ri-share-forward-line font-bold" />
          </button>
          <button
            onClick={handleToggleFavorite}
            className="w-8 h-8 rounded-lg border-2 border-black bg-white flex items-center justify-center shadow-comic-sm hover:bg-gray-100 active:translate-x-0.5 active:translate-y-0.5 transition-transform"
            title={isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'}
          >
            <i
              className={`${
                isFavorite ? 'ri-heart-3-fill text-[#E63946] scale-110' : 'ri-heart-3-line text-black'
              } text-lg transition-transform`}
            />
          </button>
        </div>
      </div>

      {/* 2. Manga Vinyl Cover Presentation Card */}
      <div className="card-comic p-4 flex flex-col gap-3 relative bg-white">
        <div className="sticker-comic">
          <span
            className={`badge-comic ${
              isTargetAudioPlaying && isPlaying ? 'badge-comic-red' : 'badge-comic-blue'
            } text-[10px]`}
          >
            {isTargetAudioPlaying && isPlaying ? '● LIVE STREAM' : 'SẴN SÀNG'}
          </span>
        </div>

        {/* Cover Art + Vinyl Disc Layout */}
        <div className="relative w-full aspect-[16/10] max-h-56 rounded-xl border-2 border-black overflow-hidden bg-black flex items-center justify-center shadow-comic-sm">
          <img className="w-full h-full object-cover" src={audio.thumbnailUrl} alt={audio.title} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

          {/* Spinning Manga Vinyl Disc Overlay when playing */}
          <div
            className={`absolute -right-8 -bottom-8 w-36 h-36 rounded-full border-4 border-black bg-[#111111] shadow-comic flex items-center justify-center ${
              isTargetAudioPlaying && isPlaying ? 'spin-disc' : 'spin-disc spin-disc-paused'
            } pointer-events-none opacity-85`}
          >
            <div className="w-24 h-24 rounded-full border border-gray-700 bg-[#1A1A1A] flex items-center justify-center">
              <div className="w-12 h-12 rounded-full border-2 border-black bg-[#FFE600] flex items-center justify-center">
                <i className="ri-disc-fill text-xl text-black" />
              </div>
            </div>
          </div>

          <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-white z-10">
            <span className="badge-comic badge-comic-yellow text-[10px] text-black">
              TẬP {String(activeEp.episodeNumber || 1).padStart(2, '0')}:  {currentPercent}%
            </span>
          </div>
        </div>

        {/* Title, Author & Tags */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge-comic badge-comic-blue text-[10px]">{audio.categoryName || 'Chung'}</span>
            {audio.isVIPOnly && (
              <span className="badge-comic badge-comic-purple text-[10px]">
                <i className="ri-vip-crown-fill" /> VIP ONLY
              </span>
            )}
            <span className="badge-comic badge-comic-white text-[10px]">
              {audio.totalEpisodes || audio.episodes?.length || 1} TẬP
            </span>
            <span className="badge-comic badge-comic-white text-[10px]">
              {audio.formattedDuration || '24h 00m'}
            </span>
          </div>
          <h2 className="font-extrabold text-lg text-black leading-tight mt-1">{audio.title}</h2>
          <p className="text-xs font-semibold text-gray-600 flex items-center gap-2">
            <span>
              Tác giả: <strong className="text-black">{audio.author || 'Chưa rõ'}</strong>
            </span>
            <span>•</span>
            <span>
              Kênh: <strong className="text-black">{audio.channel || 'Official'}</strong>
            </span>
          </p>
        </div>
      </div>

      {/* 3. Resume Bar Shortcut */}
      <div className="card-comic-sm p-3 bg-[#FEF9C3] flex items-center justify-between gap-2 border-2 border-black shadow-comic-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg border border-black bg-[#FFE600] flex items-center justify-center text-black shrink-0 shadow-comic-sm">
            <i className="ri-history-line font-bold" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase text-gray-700">Mốc nghe gần nhất</span>
              <button
                type="button"
                onClick={handleManualSyncRecent}
                className="badge-comic badge-comic-yellow text-[9px] font-mono shrink-0 flex items-center gap-1 cursor-pointer hover:bg-yellow-200 active:scale-95 transition-all shadow-[1px_1px_0_#000]"
                title="Đang đếm ngược để đồng bộ mốc nghe. Chạm để đồng bộ ngay!"
              >
                <i className={`ri-refresh-line text-[9px] ${isTargetAudioPlaying && isPlaying ? 'animate-spin' : ''}`} />
                SYNC: {isTargetAudioPlaying && isPlaying ? `${syncCountdown}s` : '60s'}
              </button>
            </div>
            <span className="text-xs font-bold text-black truncate flex items-center gap-1">
              Tiếp tục từ <strong>{syncedRecentInfo?.position || (isTargetAudioPlaying && currentTime > 0 ? formatTime(currentTime) : (audio.formattedPosition || '00:00:00'))}</strong>:(Tập {syncedRecentInfo?.epNumber || (isTargetAudioPlaying && currentEpisode ? currentEpisode.episodeNumber : (audio.currentEpisodeNumber || 1))})<span className="text-[10px] font-mono"> {currentPercent}% </span> 
            </span>
          </div>
        </div>
        <button
          onClick={handleResumeShortcut}
          className="btn-comic btn-comic-primary text-xs py-1 px-3 shrink-0"
        >
          <i className="ri-play-fill font-bold" /> Nghe tiếp
        </button>
      </div>

      {/* 4. Main Playback Console */}
      <div className="card-comic p-4 flex flex-col gap-3 bg-white">
        {/* Live Status & Waveform Header */}
        <div className="flex items-center justify-between text-xs pb-1 border-b border-black">
          <div className="flex items-center gap-2 min-w-0">
            <Equalizer isPlaying={isTargetAudioPlaying && isPlaying} />
            <span className="font-extrabold text-black truncate">{activeEp.title}</span>
          </div>
          <button
            onClick={handleManualSyncRecent}
            className="badge-comic badge-comic-teal text-[9px] py-0.5 font-mono cursor-pointer hover:bg-teal-200 active:scale-95 transition-all flex items-center gap-1"
            title="Tự động đồng bộ mốc nghe mỗi 60s. Chạm để đồng bộ ngay!"
          >
            <i className={`ri-refresh-line ${isTargetAudioPlaying && isPlaying ? 'animate-spin' : ''}`} /> SYNC: {syncCountdown}s
          </button>
        </div>

        {/* Custom Comic Range Slider (Scrub Bar) with Accidental Seek Lock */}
        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex items-center gap-2">
            <div className="flex-1">
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
              className={`w-8 h-8 rounded-lg border-2 border-black flex items-center justify-center text-sm shrink-0 transition-all shadow-comic-sm ${
                isSeekLocked ? 'bg-[#E63946] text-white hover:bg-red-600' : 'bg-gray-100 text-gray-700 hover:bg-[#FFE600]'
              }`}
              title={isSeekLocked ? 'Mở khóa thanh tua thời lượng' : 'Khóa thanh tua thời lượng chống chạm nhầm'}
            >
              <i className={isSeekLocked ? 'ri-lock-2-fill' : 'ri-lock-unlock-line'} />
            </button>
          </div>
          <div className="flex items-center justify-between font-mono text-xs font-bold text-gray-700">
            <span>{formatTime(currentPosition)}</span>
            <span className={`badge-comic ${isSeekLocked ? 'badge-comic-red' : 'badge-comic-yellow'} text-[9px] py-0 px-1 font-mono`}>
              {isSeekLocked ? 'ĐÃ KHÓA TUA' : `Đã nghe ${currentPercent}%`}
            </span>
            <span>{formatTime(episodeDuration)}</span>
          </div>
        </div>

        {/* Tactile Control Buttons Row */}
        <div className="flex items-center justify-between pt-2">
          {/* Speed Toggle */}
          <button
            onClick={() => setIsSpeedModalOpen(true)}
            className="btn-comic text-xs py-1 px-2.5 bg-[#FFE600] font-black border-2 border-black shadow-comic-sm hover:scale-105 active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center gap-1"
            title="Đổi tốc độ phát (x1, x1.5, x2...)"
          >
            <i className="ri-speed-line text-sm" />
            <span>{playbackRate}x</span>
          </button>

          {/* Prev Episode */}
          <button
            onClick={prevEpisode}
            className="w-10 h-10 rounded-lg border-2 border-black bg-white flex items-center justify-center text-black shadow-comic-sm hover:bg-gray-100 active:translate-x-0.5 active:translate-y-0.5"
            title="Tập trước"
          >
            <i className="ri-skip-back-line text-lg font-bold" />
          </button>

          {/* Rewind 10s */}
          <button
            onClick={() => {
              if (isTargetAudioPlaying) skipSeconds(-10);
              else play(audio, activeEp, Math.max(0, currentPosition - 10));
            }}
            className="w-10 h-10 rounded-lg border-2 border-black bg-white flex items-center justify-center text-black shadow-comic-sm hover:bg-gray-100 active:translate-x-0.5 active:translate-y-0.5"
            title="Tua lùi 10s"
          >
            <i className="ri-replay-10-line text-lg font-bold" />
          </button>

          {/* Master Big Play / Pause */}
          <button
            onClick={handleMasterPlay}
            className={`w-14 h-14 rounded-full border-3 border-black ${
              isTargetAudioPlaying && isPlaying ? 'bg-[#FFE600] text-black' : 'bg-[#3A86FF] text-white'
            } flex items-center justify-center shadow-comic hover:scale-105 active:translate-x-1 active:translate-y-1 transition-all`}
            title="Phát / Tạm dừng"
          >
            <i className={`${isTargetAudioPlaying && isPlaying ? 'ri-pause-fill' : 'ri-play-fill'} text-3xl`} />
          </button>

          {/* Forward 10s */}
          <button
            onClick={() => {
              if (isTargetAudioPlaying) skipSeconds(10);
              else play(audio, activeEp, currentPosition + 10);
            }}
            className="w-10 h-10 rounded-lg border-2 border-black bg-white flex items-center justify-center text-black shadow-comic-sm hover:bg-gray-100 active:translate-x-0.5 active:translate-y-0.5"
            title="Tua tới 10s"
          >
            <i className="ri-forward-10-line text-lg font-bold" />
          </button>

          {/* Next Episode */}
          <button
            onClick={() => {
              const eps = audio.episodes || [];
              const currIdx = eps.findIndex((e) => e.id === activeEp.id);
              if (currIdx !== -1 && currIdx + 1 < eps.length) {
                const nextEp = eps[currIdx + 1];
                if (isEpLocked(nextEp)) {
                  handleLockedEpisodeAction('Tập tiếp theo chỉ dành riêng cho thành viên VIP.');
                  return;
                }
              }
              nextEpisode();
            }}
            className="w-10 h-10 rounded-lg border-2 border-black bg-white flex items-center justify-center text-black shadow-comic-sm hover:bg-gray-100 active:translate-x-0.5 active:translate-y-0.5"
            title="Tập tiếp theo"
          >
            <i className="ri-skip-forward-line text-lg font-bold" />
          </button>

          {/* Sleep Timer */}
          <button
            onClick={() => setIsSleepModalOpen(true)}
            className={`w-9 h-9 rounded-lg border-2 border-black ${
              sleepTimerMinutes ? 'bg-[#FFE600] text-black' : 'bg-white text-gray-700'
            } flex items-center justify-center shadow-comic-sm hover:bg-gray-100 active:translate-x-0.5 active:translate-y-0.5`}
            title="Hẹn giờ tắt"
          >
            <i className="ri-moon-line text-base font-bold" />
          </button>
        </div>
      </div>

      {/* 5. Episodes List Drawer */}
      <div className="card-comic p-4 flex flex-col gap-3 bg-white">
        <div className="flex items-center justify-between pb-2 border-b-2 border-black">
          <div>
            <h3 className="font-extrabold text-base uppercase text-black">Danh sách tập</h3>
            <span className="text-xs font-semibold text-gray-600">
              {audio.episodes?.length || 0} tập logic • Khối 4 giờ
            </span>
          </div>
          <button
            onClick={handleRefreshMetadata}
            disabled={isRefreshing}
            className="btn-comic text-[11px] py-1 px-2.5 bg-gray-100"
            title="Đồng bộ lại thông tin từ YouTube"
          >
            <i className={`ri-refresh-line ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Episode Items */}
        <div className="flex flex-col gap-2">
          {(audio.episodes || [])
            .slice((episodePage - 1) * DEFAULT_PAGE_SIZE, episodePage * DEFAULT_PAGE_SIZE)
            .map((ep) => {
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
                      ? 'bg-purple-50/60 !border-purple-300 opacity-90 hover:bg-purple-50'
                      : isThisEpActive
                      ? 'bg-[#FEF9C3] !border-2 !border-black shadow-comic'
                      : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg border-2 border-black flex items-center justify-center shrink-0 shadow-comic-sm ${
                        epLocked
                          ? 'bg-[#8338EC] text-white font-bold'
                          : isThisEpActive
                          ? 'bg-[#FFE600] text-black font-black'
                          : isCompleted
                          ? 'bg-[#2A9D8F] text-white'
                          : 'bg-gray-100 text-black font-bold'
                      }`}
                    >
                      {epLocked ? (
                        <i className="ri-lock-2-fill text-lg text-[#FFE600]" />
                      ) : isThisEpActive ? (
                        <i className="ri-play-fill text-lg" />
                      ) : isCompleted ? (
                        <i className="ri-check-line text-lg font-black" />
                      ) : (
                        `T${ep.episodeNumber}`
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-xs text-black truncate leading-tight">
                          {ep.title}
                        </span>
                        {epIsVip && ep.episodeNumber === 1 && (
                          <span className="badge-comic badge-comic-teal text-[8px] py-0 px-1 font-black shrink-0">
                            <i className="ri-eye-line" /> XEM TRƯỚC TẬP 1
                          </span>
                        )}
                        {epIsVip && ep.episodeNumber > 1 && (
                          <span className="badge-comic badge-comic-purple text-[8px] py-0 px-1 font-black shrink-0">
                            <i className="ri-vip-crown-fill text-[#FFE600]" /> VIP
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-gray-600 truncate mt-0.5">
                        {formatTime(ep.startSeconds)} - {formatTime(ep.endSeconds)} • {ep.progressPercent || 0}%
                      </span>
                    </div>
                  </div>

                  <span
                    className={`badge-comic ${
                      epLocked
                        ? 'badge-comic-purple !bg-[#8338EC] text-white'
                        : isThisEpActive
                        ? 'badge-comic-yellow'
                        : isCompleted
                        ? 'badge-comic-teal'
                        : 'badge-comic-white'
                    } text-[9px]`}
                  >
                    {epLocked ? (
                      <span className="flex items-center gap-0.5">
                        <i className="ri-lock-2-line" /> KHÓA VIP
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

        <Pagination
          currentPage={episodePage}
          totalPages={Math.ceil((audio.episodes || []).length / DEFAULT_PAGE_SIZE) || 1}
          totalItems={(audio.episodes || []).length}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={(p) => setEpisodePage(p)}
        />
      </div>

      {/* Speed Selection Modal */}
      <Modal
        isOpen={isSpeedModalOpen}
        onClose={() => setIsSpeedModalOpen(false)}
        title="TỐC ĐỘ PHÁT AUDIO"
        showFooter={false}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[11px] sm:text-xs text-gray-700 font-semibold">
            Tốc độ tiêu chuẩn (Tự động lưu lại cho tất cả audio):
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[1.0, 1.5, 2.0].map((s) => {
              const isSelected = Math.abs(playbackRate - s) < 0.05;
              return (
                <button
                  key={s}
                  onClick={() => {
                    setPlaybackRate(s, user?.id);
                    setIsSpeedModalOpen(false);
                  }}
                  className={`btn-comic text-sm py-2.5 font-black flex items-center justify-center gap-1 ${
                    isSelected ? 'btn-comic-yellow ring-2 ring-black' : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <span>{s}x</span>
                  {isSelected && <i className="ri-check-line font-black text-black" />}
                </button>
              );
            })}
          </div>

          <p className="text-[11px] sm:text-xs text-gray-500 font-semibold mt-1">Các mức điều chỉnh khác:</p>
          <div className="grid grid-cols-4 gap-1.5">
            {[0.5, 0.75, 1.25, 1.75].map((s) => {
              const isSelected = Math.abs(playbackRate - s) < 0.05;
              return (
                <button
                  key={s}
                  onClick={() => {
                    setPlaybackRate(s, user?.id);
                    setIsSpeedModalOpen(false);
                  }}
                  className={`btn-comic text-xs py-1.5 font-bold flex items-center justify-center gap-0.5 ${
                    isSelected ? 'btn-comic-yellow ring-2 ring-black' : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <span>{s}x</span>
                  {isSelected && <i className="ri-check-line font-bold" />}
                </button>
              );
            })}
          </div>

          <div className="card-comic-sm p-2 bg-[#FEF9C3] text-[11px] text-gray-700 font-bold flex items-center gap-2 border border-black">
            <i className="ri-save-line text-base text-black shrink-0" />
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
      >
        <div className="flex flex-col gap-2">
          <p className="text-[11px] sm:text-xs text-gray-700 font-semibold">Tự động tạm dừng sau:</p>
          <div className="grid grid-cols-2 gap-1.5">
            {[15, 30, 45, 60].map((mins) => (
              <button
                key={mins}
                onClick={() => {
                  setSleepTimer(mins);
                  setIsSleepModalOpen(false);
                  toast.success(`Đã hẹn giờ tắt sau ${mins} phút`);
                }}
                className={`btn-comic text-xs py-1.5 ${sleepTimerMinutes === mins ? 'btn-comic-yellow' : 'bg-white'}`}
              >
                {mins} phút
              </button>
            ))}
          </div>
          {sleepTimerMinutes && (
            <button
              onClick={() => {
                setSleepTimer(null);
                setIsSleepModalOpen(false);
                toast.info('Đã hủy hẹn giờ tắt');
              }}
              className="btn-comic btn-comic-red text-xs py-1.5 mt-0.5"
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

