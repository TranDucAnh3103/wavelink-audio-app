'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Youtube,
  Gauge,
  LogIn,
  Crown,
  AlertTriangle,
  Link2,
  X,
  ClipboardPaste,
  Loader2,
  SearchCheck,
  Check,
  Calculator,
  Gift,
  Lock,
  CheckCheck,
  Info,
} from 'lucide-react';
import { useCategories } from '@/hooks/useCategories';
import { useImportYouTube, useImportQuota } from '@/hooks/useAudio';
import { triggerNotificationSync } from '@/hooks/useNotifications';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { YouTubePreviewData, AudioItem } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import {
  extractYouTubeId,
  formatDuration,
  parseDurationToSec,
  computeLogicalEpisodes,
} from '@/lib/utils';
import { resolveYouTubeDurationViaIframe } from '@/lib/youtubeResolver';
import { UploadSkeleton } from '@/components/common/Skeletons';

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLive, isLoading, isInitialized } = useAuthStore();
  const { data: categories = [] } = useCategories();
  const importMutation = useImportYouTube();
  const { data: importQuota } = useImportQuota();

  const [url, setUrl] = useState('');
  const [categoryId, setCategoryId] = useState<number>(1);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [durationInput, setDurationInput] = useState('');
  const [blockSize, setBlockSize] = useState<number>(14400);
  const [isVipOnly, setIsVipOnly] = useState(false);
  const [freeEpisodesCount, setFreeEpisodesCount] = useState<number>(1);

  const [isChecking, setIsChecking] = useState(false);
  const [previewData, setPreviewData] = useState<YouTubePreviewData | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const [duplicateModalAudio, setDuplicateModalAudio] = useState<AudioItem | null>(null);
  const [successModalAudio, setSuccessModalAudio] = useState<AudioItem | null>(null);

  const isVipOrAdmin = user?.role === 'ADMIN' || user?.role === 'VIP';
  const userRole = user?.role || 'GUEST';

  const checkDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  const autoScanMetadata = (title: string, description?: string) => {
    const descText = description || '';
    const fullText = `${title} ${descText}`;
    const text = fullText.toLowerCase();

    if (categories.length > 0) {
      let matchedCategory = undefined;
      const sortedCategories = [...categories].sort((a, b) => b.name.length - a.name.length);
      matchedCategory = sortedCategories.find((c) => text.includes(c.name.toLowerCase()));

      if (!matchedCategory) {
        matchedCategory = sortedCategories.find((c) => {
          const slugText = c.slug.replace(/-/g, ' ').toLowerCase();
          return text.includes(slugText);
        });
      }

      if (!matchedCategory) {
        const findCat = (slugs: string[], names: string[]) => {
          return categories.find((c) => {
            const s = c.slug.toLowerCase();
            const n = c.name.toLowerCase();
            return slugs.some((slug) => s.includes(slug)) || names.some((name) => n.includes(name));
          });
        };

        if (text.includes('tiên hiệp') || text.includes('tu tiên') || text.includes('tu chân') || text.includes('phi thăng')) {
          matchedCategory = findCat(['tien-hiep'], ['tiên hiệp']);
        } else if (text.includes('kiếm hiệp') || text.includes('võ hiệp') || text.includes('kim dung') || text.includes('cổ long') || text.includes('võ lâm')) {
          matchedCategory = findCat(['kiem-hiep'], ['kiếm hiệp']);
        } else if (text.includes('huyền huyễn') || text.includes('dị giới') || text.includes('ma pháp') || text.includes('đấu khí')) {
          matchedCategory = findCat(['huyen-huyen'], ['huyền huyễn']);
        } else if (text.includes('xuyên nhanh') || text.includes('khoái xuyên')) {
          matchedCategory = findCat(['xuyen-nhanh'], ['xuyên nhanh']);
        } else if (text.includes('xuyên không') || text.includes('xuyên việt') || text.includes('xuyên thư')) {
          matchedCategory = findCat(['xuyen-khong'], ['xuyên không']);
        } else if (text.includes('trọng sinh') || text.includes('tái sinh') || text.includes('sống lại')) {
          matchedCategory = findCat(['trong-sinh'], ['trọng sinh']);
        } else if (text.includes('kinh dị') || text.includes('truyện ma') || text.includes('nguyễn ngọc ngạn') || text.includes('rùng rợn') || text.includes('ma quái') || text.includes('linh dị') || text.includes('quái đàm')) {
          matchedCategory = findCat(['ma-kinh-di', 'kinh-di', 'linh-di'], ['kinh dị', 'linh dị', 'ma']);
        } else if (text.includes('ngôn tình') || text.includes('tình cảm') || text.includes('lãng mạn') || text.includes('sủng') || text.includes('tổng tài')) {
          matchedCategory = findCat(['ngon-tinh'], ['ngôn tình']);
        } else if (text.includes('trinh thám') || text.includes('vụ án') || text.includes('thám tử') || text.includes('phá án')) {
          matchedCategory = findCat(['trinh-tham'], ['trinh thám']);
        } else if (text.includes('mạt thế') || text.includes('tận thế') || text.includes('thây ma') || text.includes('zombie')) {
          matchedCategory = findCat(['mat-the'], ['mạt thế']);
        } else if (text.includes('đô thị') || text.includes('thương trường') || text.includes('hào môn')) {
          matchedCategory = findCat(['do-thi'], ['đô thị']);
        } else if (text.includes('võng du') || text.includes('game online') || text.includes('thực tế ảo')) {
          matchedCategory = findCat(['vong-du'], ['võng du']);
        } else if (text.includes('khoa huyễn') || text.includes('viễn tưởng') || text.includes('cơ giáp') || text.includes('tinh tế')) {
          matchedCategory = findCat(['khoa-huyen'], ['khoa huyễn']);
        } else if (text.includes('hệ thống') || text.includes('điểm danh')) {
          matchedCategory = findCat(['he-thong'], ['hệ thống']);
        } else if (text.includes('dị năng') || text.includes('siêu năng')) {
          matchedCategory = findCat(['di-nang'], ['dị năng']);
        } else if (text.includes('vô địch lưu') || text.includes('vô địch')) {
          matchedCategory = findCat(['vo-dich'], ['vô địch']);
        } else if (text.includes('sảng văn')) {
          matchedCategory = findCat(['sang-van'], ['sảng văn']);
        } else if (text.includes('lịch sử quân sự') || text.includes('lịch sử') || text.includes('quân sự') || text.includes('chiến tranh')) {
          matchedCategory = findCat(['lich-su-quan-su', 'lich-su'], ['lịch sử']);
        } else if (text.includes('cung đấu gia đấu') || text.includes('cung đấu') || text.includes('gia đấu') || text.includes('trạch đấu')) {
          matchedCategory = findCat(['cung-dau'], ['cung đấu']);
        } else if (text.includes('sách nói') || text.includes('audiobook') || text.includes('kỹ năng') || text.includes('tâm lý') || text.includes('self help')) {
          matchedCategory = findCat(['audiobook', 'sach-noi', 'sach'], ['sách nói', 'audiobook', 'sách']);
        }
      }

      if (matchedCategory) {
        setCategoryId(matchedCategory.id);
      }
    }

    const detectedTags: string[] = [];
    const addDetectedTag = (tag: string) => {
      const clean = tag.replace(/^#+/, '').trim();
      if (!clean) return;
      const exists = detectedTags.some((t) => t.toLowerCase() === clean.toLowerCase());
      if (!exists) {
        detectedTags.push(clean);
      }
    };

    const HASHTAG_MAP: Record<string, string> = {
      tienhiep: 'Tiên Hiệp',
      tutien: 'Tu Tiên',
      kiemhiep: 'Kiếm Hiệp',
      huyenhuyen: 'Huyền Huyễn',
      xuyenkhong: 'Xuyên Không',
      xuyennhanh: 'Xuyên Nhanh',
      trongsinh: 'Trọng Sinh',
      dothi: 'Đô Thị',
      kinhdi: 'Kinh Dị',
      truyenma: 'Truyện Ma',
      linhdi: 'Linh Dị',
      matthe: 'Mạt Thế',
      khoahuyen: 'Khoa Huyễn',
      vongdu: 'Võng Du',
      hethong: 'Hệ Thống',
      dinang: 'Dị Năng',
      audiobook: 'Audiobook',
      sachnoi: 'Sách Nói',
      trinhtham: 'Trinh Thám',
      ngontinh: 'Ngôn Tình',
      cungdau: 'Cung Đấu',
      lichsu: 'Lịch Sử',
      haihuoc: 'Hài Hước',
      tongtai: 'Tổng Tài',
      tronbo: 'Trọn Bộ',
      full: 'Full',
      vodich: 'Vô Địch Lưu',
      vodichluu: 'Vô Địch Lưu',
      caudao: 'Cẩu Đạo',
      hacam: 'Hắc Ám',
      haucung: 'Hậu Cung',
      truyenngan: 'Truyện Ngắn',
      audiodai: 'Audio Dài',
      bachngocsach: 'Bạch Ngọc Sách',
    };

    const hashtagMatches = fullText.matchAll(/#([\p{L}\p{N}_-]+)/gu);
    for (const match of hashtagMatches) {
      const raw = match[1].trim();
      if (!raw) continue;
      const key = raw.toLowerCase().replace(/[-_]/g, '');
      if (HASHTAG_MAP[key]) {
        addDetectedTag(HASHTAG_MAP[key]);
      } else {
        const formatted = raw.replace(/[_-]/g, ' ');
        const displayTag = formatted.charAt(0).toUpperCase() + formatted.slice(1);
        addDetectedTag(displayTag);
      }
    }

    const SEMANTIC_KEYWORD_TAGS = [
      'Tiên Hiệp', 'Tu Tiên', 'Kiếm Hiệp', 'Huyền Huyễn', 'Xuyên Không', 'Xuyên Nhanh',
      'Trọng Sinh', 'Đô Thị', 'Kinh Dị', 'Truyện Ma', 'Linh Dị', 'Mạt Thế', 'Khoa Huyễn',
      'Võng Du', 'Hệ Thống', 'Dị Năng', 'Audiobook', 'Sách Nói', 'Trinh Thám',
      'Ngôn Tình', 'Cung Đấu', 'Lịch Sử Quân Sự', 'Hài Hước', 'Tổng Tài',
      'Trọn Bộ', 'Full', 'Truyện Ngắn', 'Vô Địch Lưu', 'Cẩu Đạo', 'Hắc Ám',
      'Đô Thị Tu Tiên', 'Hậu Cung', 'Sát Phạt Quyết Đoán', 'Bạch Ngọc Sách', 'Audio Dài',
    ];
    for (const kw of SEMANTIC_KEYWORD_TAGS) {
      if (text.includes(kw.toLowerCase())) {
        addDetectedTag(kw);
      }
    }

    if (detectedTags.length > 0) {
      setTags(detectedTags);
      toast.info(`Hệ thống đã tự động nhận diện và gắn thẻ: ${detectedTags.slice(0, 3).join(', ')}`);
    } else {
      setTags([]);
    }
  };

  const checkURL = async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      setPreviewData(null);
      setUrlError(null);
      return;
    }
    const videoId = extractYouTubeId(trimmed);
    if (!videoId) {
      setUrlError('Liên kết YouTube không đúng định dạng');
      setPreviewData(null);
      return;
    }

    setIsChecking(true);
    setUrlError(null);
    try {
      const data = await api.audio.previewYouTube(trimmed, isLive);
      if (data && data.title) {
        setPreviewData(data);
        autoScanMetadata(data.title, data.description);
        if (data.formattedDuration && data.durationSeconds > 0) {
          setDurationInput(data.formattedDuration);
        } else if (data.durationSeconds > 0) {
          setDurationInput(formatDuration(data.durationSeconds));
        } else {
          const resolvedDur = await resolveYouTubeDurationViaIframe(videoId);
          if (resolvedDur === -1) {
            setUrlError('Video YouTube không tồn tại, ở chế độ riêng tư hoặc không thể phát');
            setPreviewData(null);
            setDurationInput('');
            return;
          } else if (resolvedDur > 0) {
            setPreviewData({
              ...data,
              durationSeconds: resolvedDur,
              formattedDuration: formatDuration(resolvedDur),
            });
            setDurationInput(formatDuration(resolvedDur));
          }
        }
      } else {
        throw new Error('Video YouTube không tồn tại hoặc bị lỗi phát');
      }
    } catch (err: unknown) {
      const probeDur = await resolveYouTubeDurationViaIframe(videoId);
      if (probeDur > 0) {
        setPreviewData({
          videoId,
          title: 'Audio YouTube - ' + videoId,
          author: 'YouTube Creator',
          durationSeconds: probeDur,
          formattedDuration: formatDuration(probeDur),
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        });
        setDurationInput(formatDuration(probeDur));
        setUrlError(null);
      } else {
        const msg = (err as Error)?.message || 'Video YouTube không tồn tại hoặc không thể phát!';
        setUrlError(msg);
        setPreviewData(null);
        setDurationInput('');
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleUrlChange = (val: string) => {
    setUrl(val);
    setUrlError(null);
    if (checkDebounceRef.current) clearTimeout(checkDebounceRef.current);
    if (val.includes('youtube.com/') || val.includes('youtu.be/')) {
      checkDebounceRef.current = setTimeout(() => {
        checkURL(val);
      }, 400);
    } else if (!val.trim()) {
      setPreviewData(null);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        checkURL(text);
      }
    } catch {
      toast.error('Không đọc được bộ nhớ tạm, vui lòng dán thủ công');
    }
  };

  const handleAddTag = () => {
    const cleanTag = newTag.trim().replace(/^#+/, '').trim();
    if (!cleanTag) return;
    const isDuplicate = tags.some((t) => t.toLowerCase() === cleanTag.toLowerCase());
    if (isDuplicate) {
      toast.info(`Thẻ tag "${cleanTag}" đã tồn tại`);
      setNewTag('');
      return;
    }
    setTags((prev) => [...prev, cleanTag]);
    setNewTag('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const calculatedTotalSec = parseDurationToSec(durationInput, previewData?.durationSeconds || 0);
  const computedEpisodes = computeLogicalEpisodes(calculatedTotalSec, blockSize);
  const calculatedEpisodeCount = computedEpisodes.length;

  const isQuotaExceeded =
    !isVipOrAdmin && !user?.isGuest && Boolean(importQuota && importQuota.canImport === false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.isGuest) {
      toast.error('Khách vãng lai chưa thể nhập link. Vui lòng đăng nhập hoặc tạo tài khoản!');
      navigate('/login');
      return;
    }
    if (isQuotaExceeded) {
      toast.error(
        'Bạn đã dùng hết hạn mức 5 lượt import hôm nay. Vui lòng nâng cấp VIP để tiếp tục không giới hạn!'
      );
      navigate('/membership');
      return;
    }
    if (!url.trim()) {
      toast.error('Vui lòng nhập liên kết YouTube');
      return;
    }
    if (urlError) {
      toast.error(urlError);
      return;
    }
    if (!previewData) {
      toast.error('Video YouTube không hợp lệ hoặc không tồn tại! Vui lòng kiểm tra lại liên kết.');
      return;
    }

    let dur = parseDurationToSec(durationInput, previewData?.durationSeconds || 0);
    if (previewData && previewData.durationSeconds > 0) {
      if (dur <= 0 || Math.abs(dur - previewData.durationSeconds) < 60) {
        dur = previewData.durationSeconds;
      }
    }
    if (dur <= 0) {
      const vid = extractYouTubeId(url.trim());
      if (vid) {
        try {
          dur = await resolveYouTubeDurationViaIframe(vid);
        } catch {}
      }
    }

    try {
      toast.info('Đang nhập và phân chia tập logic...');
      const result = await importMutation.mutateAsync({
        url: url.trim(),
        categoryId,
        tags,
        blockSizeSeconds: blockSize,
        durationSeconds: dur,
        isVipOnly,
        freeEpisodesCount: isVipOnly ? freeEpisodesCount : 1,
      });

      if (result.duplicate) {
        setDuplicateModalAudio(result.audio);
      } else {
        setSuccessModalAudio(result.audio);
        triggerNotificationSync(true);
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Lỗi khi nhập audio');
    }
  };

  const isAuthBlocking =
    !user &&
    (isLoading ||
      (!isInitialized &&
        Boolean(typeof localStorage !== 'undefined' && localStorage.getItem('auth_token'))));
  const showSkeletonFallback = useDelayedFallback(isAuthBlocking, 180);

  if (showSkeletonFallback) {
    return <UploadSkeleton />;
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-4 pt-2 fade-in-comic">
      {/* 1. Header Banner */}
      <div className="card-comic p-4 bg-[#FFE600] text-[#111113] flex flex-col gap-1 border-2 border-[#111113]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl border-2 border-[#111113] bg-white flex items-center justify-center shadow-comic-sm shrink-0">
              <Youtube className="w-5 h-5 text-[#E63946]" strokeWidth={2.5} />
            </div>
            <h1 className="font-comic font-extrabold text-base md:text-lg uppercase text-[#111113] tracking-tight">
              Nhập Nguồn YouTube
            </h1>
          </div>
          <span className="badge-comic badge-comic-white text-[9px] font-black">
            100% POLICY COMPLIANT
          </span>
        </div>
        <p className="text-xs font-bold text-[#111113]/80 mt-0.5">
          Hệ thống máy phát ảo MP3: Không tải tệp về server, trực tiếp phát luồng từ Google CDN.
        </p>
      </div>

      {/* 2. Quota Status Card */}
      <div className="card-comic-sm p-3.5 bg-[var(--surface-card)] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center text-[var(--ink-primary)] shrink-0">
            <Gauge className="w-5 h-5" strokeWidth={2.25} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-extrabold uppercase text-[var(--ink-muted)]">
              {user?.isGuest ? 'Quyền hạn: Khách vãng lai' : `Hạn mức của bạn (${userRole})`}
            </span>
            <span className="text-xs font-bold text-[var(--ink-primary)]">
              {user?.isGuest
                ? 'Khách chưa thể nhập link — vui lòng đăng nhập'
                : isVipOrAdmin
                  ? 'Không giới hạn lượt import'
                  : `Miễn phí: Đã dùng ${importQuota?.todayImportCount ?? 0}/5 hôm nay (còn ${importQuota?.remaining ?? 5} lượt)`}
            </span>
          </div>
        </div>
        {user?.isGuest ? (
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="btn-comic btn-comic-primary text-[11px] py-1.5 px-3 font-bold"
          >
            <LogIn className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>Đăng Nhập</span>
          </button>
        ) : !isVipOrAdmin ? (
          <button
            type="button"
            onClick={() => navigate('/membership')}
            className="btn-comic btn-comic-purple text-[11px] py-1.5 px-3"
          >
            <Crown className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>Lên VIP</span>
          </button>
        ) : (
          <span className="badge-comic badge-comic-teal text-[9px]">UNLIMITED</span>
        )}
      </div>

      {/* Quota Exceeded Warning */}
      {isQuotaExceeded && (
        <div className="card-comic-sm p-3.5 bg-[#FFF1F2] dark:bg-[#2F161A] border-2 border-[#E63946] flex items-center justify-between gap-3 shadow-comic-sm flex-wrap">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#E63946] shrink-0" strokeWidth={2.5} />
            <span className="text-xs font-bold text-[#B91C1C] dark:text-[#FCA5A5] leading-snug">
              Bạn đã dùng hết hạn mức 5 lượt import hôm nay. Vui lòng nâng cấp VIP để tiếp tục không giới hạn!
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/membership')}
            className="btn-comic btn-comic-purple text-[11px] py-1.5 px-3 shrink-0"
          >
            <Crown className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>Lên VIP Ngay</span>
          </button>
        </div>
      )}

      {/* 3. Responsive 2-Column Form Workspace */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: URL, Duration & Category/Tags */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="card-comic p-4 flex flex-col gap-3">
            <label
              className="font-extrabold text-xs uppercase text-[var(--ink-primary)] flex items-center justify-between"
              htmlFor="yt-url-input"
            >
              <span>
                YouTube URL (Video, Shorts, Music...) <span className="text-[#E63946]">*</span>
              </span>
            </label>
            <div className="flex flex-col gap-2">
              <div className="relative w-full">
                <Link2
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none z-10"
                  strokeWidth={2.5}
                />
                <input
                  id="yt-url-input"
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  className="input-comic pl-9 pr-9 text-xs font-mono font-bold w-full"
                  required
                />
                {url && (
                  <button
                    type="button"
                    onClick={() => handleUrlChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center border border-[var(--border-ink)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-muted)] z-10 text-[var(--ink-primary)] cursor-pointer"
                    title="Xóa URL"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="btn-comic text-xs py-1.5 px-3 shrink-0"
                  title="Dán từ Clipboard"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" strokeWidth={2.25} />
                  <span>Dán</span>
                </button>
                <button
                  type="button"
                  onClick={() => checkURL(url)}
                  disabled={isChecking || !url.trim()}
                  className="btn-comic btn-comic-yellow text-xs py-1.5 px-3.5 shrink-0"
                  title="Kiểm tra link YouTube"
                >
                  {isChecking ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <SearchCheck className="w-3.5 h-3.5" strokeWidth={2.5} />
                  )}
                  <span>Kiểm tra</span>
                </button>
              </div>
            </div>

            {urlError && (
              <div className="card-comic-sm p-3 bg-[#FEE2E2] dark:bg-[#2F161A] flex items-center gap-2.5 border-2 border-[#E63946] text-[#B91C1C] dark:text-[#FCA5A5] fade-in-comic">
                <AlertTriangle className="w-5 h-5 shrink-0 text-[#E63946]" strokeWidth={2.5} />
                <div className="flex flex-col text-xs font-bold">
                  <span>{urlError}</span>
                  <span className="text-[10px] font-semibold opacity-80 mt-0.5">
                    Vui lòng kiểm tra lại liên kết YouTube hoặc thử một video hợp lệ khác.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Category & Tags Card */}
          <div className="card-comic p-4 flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label
                className="font-extrabold text-xs uppercase text-[var(--ink-primary)]"
                htmlFor="category-select"
              >
                Thể Loại Truyện
              </label>
              <select
                id="category-select"
                value={categoryId}
                onChange={(e) => setCategoryId(parseInt(e.target.value, 10))}
                className="input-comic text-xs font-bold"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-extrabold text-xs uppercase text-[var(--ink-primary)]">
                Thẻ Tag (Phân loại)
              </label>
              <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
                {tags.length === 0 ? (
                  <span className="text-[var(--ink-muted)] text-[11px] italic">
                    Chưa có tag nào (tự động nhận diện khi nhập link YouTube)
                  </span>
                ) : (
                  tags.map((tag) => (
                    <span
                      key={tag}
                      className="badge-comic badge-comic-yellow text-[10px] py-1 px-2 flex items-center gap-1"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveTag(tag);
                        }}
                        className="font-black hover:text-[#E63946] ml-0.5 leading-none focus:outline-none cursor-pointer"
                        title={`Xóa thẻ #${tag}`}
                        aria-label={`Xóa thẻ #${tag}`}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  placeholder="Thêm tag mới..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="input-comic text-xs py-1.5 px-3 flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="btn-comic text-xs py-1.5 px-3"
                >
                  + Thêm
                </button>
              </div>
            </div>

            {/* VIP Only Option */}
            <div className="flex flex-col gap-2 pt-2.5 border-t border-[var(--border-ink)]/25">
              <div className="flex items-center gap-2">
                <input
                  id="vip-only-checkbox"
                  type="checkbox"
                  checked={isVipOnly}
                  onChange={(e) => setIsVipOnly(e.target.checked)}
                  className="w-4 h-4 border-2 border-[var(--border-ink)] rounded accent-[#8338EC] cursor-pointer"
                />
                <label
                  htmlFor="vip-only-checkbox"
                  className="text-xs font-bold text-[var(--ink-primary)] cursor-pointer flex items-center gap-1.5"
                >
                  <span>Độc quyền dành riêng cho thành viên VIP</span>
                  <span className="badge-comic badge-comic-purple text-[8px] py-0 px-1.5">
                    <Crown className="w-2.5 h-2.5" /> VIP
                  </span>
                </label>
              </div>

              {isVipOnly && (
                <div className="card-comic-sm p-3 bg-[var(--surface-accent-soft)] flex flex-col gap-1.5 ml-0 sm:ml-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-[var(--ink-primary)] flex items-center gap-1">
                        <Gift className="w-3.5 h-3.5 text-[#E63946]" strokeWidth={2.5} />
                        <span>Số tập cho xem/nghe thử FREE:</span>
                      </span>
                      <span className="text-[10px] font-medium text-[var(--ink-secondary)]">
                        Mặc định là 1 tập. Nhập 0 để khóa toàn bộ, hoặc 2+ tập cho độc giả nghe thử.
                      </span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      value={freeEpisodesCount}
                      onChange={(e) =>
                        setFreeEpisodesCount(Math.max(0, parseInt(e.target.value, 10) || 0))
                      }
                      className="input-comic text-xs py-1.5 px-2 w-20 text-center font-black"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Preview + Duration / Episode Splitting + Submit */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Live Preview Box */}
          <div className="card-comic p-4 flex flex-col gap-3">
            <span className="font-extrabold text-xs uppercase text-[var(--ink-primary)]">
              Xem Trước Video
            </span>
            {previewData ? (
              <div className="card-comic-sm p-3 bg-[var(--surface-accent-soft)] flex items-center gap-3 fade-in-comic">
                <img
                  src={previewData.thumbnailUrl}
                  alt={previewData.title}
                  className="w-16 h-20 rounded-lg border border-[var(--border-ink)] object-cover bg-[#111113] shrink-0 shadow-comic-sm"
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-extrabold text-xs text-[var(--ink-primary)] line-clamp-2 leading-tight">
                    {previewData.title}
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--ink-secondary)] truncate mt-1">
                    Kênh: {previewData.author}
                  </span>
                  <span className="badge-comic badge-comic-teal text-[9px] mt-1.5 w-max">
                    <Check className="w-2.5 h-2.5" strokeWidth={3} /> Hợp lệ (Ready)
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-xl border-2 border-dashed border-[var(--border-ink)]/40 bg-[var(--surface-elevated)] text-center flex flex-col items-center gap-1.5">
                <Youtube className="w-7 h-7 text-[var(--ink-muted)]" strokeWidth={1.75} />
                <span className="text-xs font-bold text-[var(--ink-secondary)]">
                  Dán link YouTube để xem trước thông tin & phân tập
                </span>
              </div>
            )}
          </div>

          {/* Duration & Block Size Card */}
          <div className="card-comic p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  className="font-extrabold text-xs uppercase text-[var(--ink-primary)]"
                  htmlFor="yt-duration-input"
                >
                  Thời Lượng Video
                </label>
                <span className="text-[10px] font-bold text-[var(--ink-muted)]">
                  {previewData?.formattedDuration ? (
                    <span className="badge-comic badge-comic-teal text-[9px]">
                      <Check className="w-2.5 h-2.5" strokeWidth={3} /> {previewData.formattedDuration}
                    </span>
                  ) : (
                    'Tự động nhận diện'
                  )}
                </span>
              </div>
              <input
                id="yt-duration-input"
                type="text"
                placeholder="Tự động nhận diện khi nhập URL (hoặc để trống)..."
                value={durationInput}
                onChange={(e) => setDurationInput(e.target.value)}
                className="input-comic text-xs font-mono font-bold"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                className="font-extrabold text-xs uppercase text-[var(--ink-primary)]"
                htmlFor="block-size-select"
              >
                Khối Phân Tách Tập (Block Size)
              </label>
              <select
                id="block-size-select"
                value={blockSize}
                onChange={(e) => setBlockSize(parseInt(e.target.value, 10))}
                className="input-comic text-xs font-bold"
              >
                <option value={14400}>4 Giờ / Tập (Khuyên dùng cho truyện dài)</option>
                <option value={7200}>2 Giờ / Tập</option>
                <option value={3600}>1 Giờ / Tập</option>
                <option value={1800}>30 Phút / Tập</option>
              </select>
            </div>

            <div className="card-comic-sm p-3 bg-[var(--surface-accent-soft)] flex flex-col gap-2 mt-1">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--ink-primary)] border-b border-[var(--border-ink)]/20 pb-1.5 flex-wrap gap-1">
                <span className="flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-[#3A86FF]" strokeWidth={2.5} />
                  <span>Công Thức Phân Tập Động:</span>
                </span>
                <span className="badge-comic badge-comic-red text-[10px]">
                  {calculatedEpisodeCount > 0
                    ? `${calculatedEpisodeCount} tập (Tổng: ${formatDuration(calculatedTotalSec)})`
                    : `Tự động phân tập (${Math.round(blockSize / 3600)}h/tập)`}
                </span>
              </div>
              <div className="flex flex-col gap-1 max-h-44 overflow-y-auto no-scrollbar text-[11px] font-mono">
                {computedEpisodes.length > 0 ? (
                  computedEpisodes.map((ep) => (
                    <div
                      key={ep.episodeNumber}
                      className="flex items-center justify-between p-1.5 bg-[var(--surface-card)] rounded-lg border border-[var(--border-ink)]/40"
                    >
                      <span className="font-bold text-[var(--ink-primary)]">
                        Tập {ep.episodeNumber}: {ep.formattedRange}
                      </span>
                      <span className="text-[var(--ink-secondary)] text-[10px] font-sans font-semibold">
                        {ep.formattedHours}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="text-[var(--ink-muted)] italic font-sans">
                    Hệ thống sẽ tự động bóc tách thời lượng và phân tập từ YouTube (
                    {Math.round(blockSize / 3600)}h/tập) khi bạn xác nhận...
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            id="submit-import-btn"
            type="submit"
            disabled={importMutation.isPending || isQuotaExceeded || !previewData || Boolean(urlError)}
            className={`btn-comic ${
              isQuotaExceeded || !previewData || Boolean(urlError)
                ? 'bg-[var(--surface-muted)] text-[var(--ink-muted)] cursor-not-allowed'
                : 'btn-comic-primary'
            } text-sm py-3 px-4 font-black shadow-comic-md w-full`}
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xử lý phân tập...</span>
              </>
            ) : isQuotaExceeded ? (
              <>
                <Lock className="w-4 h-4" />
                <span>Đã Hết Lượt Import Hôm Nay (5/5)</span>
              </>
            ) : !previewData || urlError ? (
              <>
                <AlertTriangle className="w-4 h-4" />
                <span>Vui lòng kiểm tra link YouTube hợp lệ</span>
              </>
            ) : (
              <>
                <CheckCheck className="w-4 h-4" strokeWidth={2.5} />
                <span>Xác Nhận & Phân Tập Tự Động</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Duplicate Video Modal */}
      <Modal
        isOpen={Boolean(duplicateModalAudio)}
        onClose={() => setDuplicateModalAudio(null)}
        title="TRUYỆN ĐÃ CÓ TRONG THƯ VIỆN"
        confirmText="Nghe Ngay"
        cancelText="Về Thư Viện"
        onConfirm={() => {
          if (duplicateModalAudio) navigate(`/player/${duplicateModalAudio.id}`);
        }}
      >
        <div className="flex flex-col items-center text-center gap-2.5 py-1">
          <div className="w-11 h-11 rounded-2xl border-2 border-[#111113] bg-[#FFE600] text-[#111113] flex items-center justify-center shadow-comic-sm">
            <Info className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <h4 className="font-extrabold text-xs sm:text-sm text-[var(--ink-primary)] uppercase leading-tight line-clamp-2">
            {duplicateModalAudio?.title}
          </h4>
          <p className="text-[11px] sm:text-xs font-semibold text-[var(--ink-secondary)] leading-snug">
            Video này đã có trên hệ thống với{' '}
            <strong>
              {duplicateModalAudio?.totalEpisodes || duplicateModalAudio?.episodes?.length || 1} tập logic
            </strong>{' '}
            ({duplicateModalAudio?.formattedDuration || 'chuẩn'}). Bạn không cần phân tập lại!
          </p>
        </div>
      </Modal>

      {/* Success Import Modal */}
      <Modal
        isOpen={Boolean(successModalAudio)}
        onClose={() => setSuccessModalAudio(null)}
        title="NHẬP THÀNH CÔNG!"
        confirmText="Phát Ngay"
        cancelText="Về Thư Viện"
        onConfirm={() => {
          if (successModalAudio) navigate(`/player/${successModalAudio.id}`);
        }}
      >
        <div className="flex flex-col items-center text-center gap-2.5 py-1">
          <div className="w-11 h-11 rounded-2xl border-2 border-[#111113] bg-[#2A9D8F] text-white flex items-center justify-center shadow-comic-sm">
            <Check className="w-5 h-5" strokeWidth={3} />
          </div>
          <h4 className="font-extrabold text-xs sm:text-sm text-[var(--ink-primary)] uppercase leading-tight line-clamp-2">
            {successModalAudio?.title}
          </h4>
          <p className="text-[11px] sm:text-xs font-semibold text-[var(--ink-secondary)] leading-snug">
            Đã tự động cắt thành{' '}
            <strong>
              {successModalAudio?.totalEpisodes || successModalAudio?.episodes?.length || 1} tập logic
            </strong>{' '}
            chuẩn 100% YouTube ToS.
          </p>
        </div>
      </Modal>
    </div>
  );
};
