'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useRecentHistory } from '@/hooks/useHistory';
import { useAudios, useImportQuota } from '@/hooks/useAudio';
import { usePlayerStore } from '@/stores/playerStore';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingState } from '@/components/common/LoadingState';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';
import { api } from '@/services/api';
import { UserProfileData } from '@/types';

export const ProfilePage: React.FC = () => {
  const { id: paramId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isLive, logout, refreshUser, isLoading, isInitialized } = useAuthStore();
  const { play } = usePlayerStore();

  // Kiểm tra xem đang xem hồ sơ người khác hay chính mình
  const isViewingOther = Boolean(paramId && (!user?.id || String(user.id) !== String(paramId)));

  // State cho hồ sơ công khai của người khác
  const [publicUser, setPublicUser] = useState<UserProfileData | null>(null);
  const [loadingPublicUser, setLoadingPublicUser] = useState<boolean>(false);

  useEffect(() => {
    if (isViewingOther && paramId) {
      setLoadingPublicUser(true);
      api.user
        .getUserProfile(paramId)
        .then((data) => setPublicUser(data))
        .catch(() => setPublicUser(null))
        .finally(() => setLoadingPublicUser(false));
    }
  }, [paramId, isViewingOther]);

  // Audio của người khác
  const { data: otherAudios = [], isLoading: loadingOtherAudios } = useAudios(
    isViewingOther && paramId ? { userId: paramId } : { status: '__none__' }
  );

  const { data: history = [] } = useRecentHistory();
  const { data: myAudios = [] } = useAudios(
    !isViewingOther && user?.id ? { userId: user.id } : { status: 'my' }
  );
  const { data: importQuota } = useImportQuota();

  // Pagination (12 items per page by default, configurable via env)
  const pageSize = DEFAULT_PAGE_SIZE;
  const [historyPage, setHistoryPage] = useState(1);
  const totalHistoryPages = Math.max(1, Math.ceil(history.length / pageSize));
  const safeHistoryPage = Math.min(Math.max(1, historyPage), totalHistoryPages);
  const paginatedHistory = history.slice((safeHistoryPage - 1) * pageSize, safeHistoryPage * pageSize);

  const [myAudiosPage, setMyAudiosPage] = useState(1);
  const totalMyAudiosPages = Math.max(1, Math.ceil(myAudios.length / pageSize));
  const safeMyAudiosPage = Math.min(Math.max(1, myAudiosPage), totalMyAudiosPages);
  const paginatedMyAudios = myAudios.slice((safeMyAudiosPage - 1) * pageSize, safeMyAudiosPage * pageSize);

  const [otherAudiosPage, setOtherAudiosPage] = useState(1);
  const totalOtherAudiosPages = Math.max(1, Math.ceil(otherAudios.length / pageSize));
  const safeOtherAudiosPage = Math.min(Math.max(1, otherAudiosPage), totalOtherAudiosPages);
  const paginatedOtherAudios = otherAudios.slice((safeOtherAudiosPage - 1) * pageSize, safeOtherAudiosPage * pageSize);

  useEffect(() => {
    if (historyPage > totalHistoryPages) setHistoryPage(totalHistoryPages);
    if (myAudiosPage > totalMyAudiosPages) setMyAudiosPage(totalMyAudiosPages);
    if (otherAudiosPage > totalOtherAudiosPages) setOtherAudiosPage(totalOtherAudiosPages);
  }, [historyPage, totalHistoryPages, myAudiosPage, totalMyAudiosPages, otherAudiosPage, totalOtherAudiosPages]);

  const [isEditNameOpen, setIsEditNameOpen] = useState(false);
  const [newUsername, setNewUsername] = useState(user?.username || '');

  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const isVipOrAdmin = user?.role === 'VIP' || user?.role === 'ADMIN';

  let vipCountdown = '';
  if (user?.role === 'VIP' && user?.vipExpiresAt) {
    const exp = new Date(user.vipExpiresAt);
    const diff = exp.getTime() - Date.now();
    if (diff > 0) {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      vipCountdown = `(Còn ${days} ngày ${hours} giờ)`;
    } else {
      vipCountdown = '(Đã hết hạn)';
    }
  }

  const handleUpdateName = async () => {
    if (!newUsername.trim()) {
      toast.error('Tên không được để trống');
      return false;
    }
    try {
      await api.user.updateProfile(newUsername.trim(), user?.email, isLive);
      await refreshUser();
      toast.success('Đã đổi tên thành công!');
      return true;
    } catch {
      toast.error('Lỗi cập nhật tên');
      return false;
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) {
      toast.error('Vui lòng nhập đầy đủ mật khẩu');
      return false;
    }
    try {
      await api.user.updatePassword(oldPassword, newPassword, isLive);
      toast.success('Đổi mật khẩu thành công!');
      return true;
    } catch {
      toast.error('Lỗi đổi mật khẩu');
      return false;
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.info('Đã đăng xuất');
    navigate('/login');
  };

  const handleResumeHistory = async (audioId: number, pos: number, episodeId?: number, episodeNumber?: number) => {
    const targetAudio = await api.audio.getAudioById(audioId, isLive);
    if (targetAudio) {
      const targetEp =
        targetAudio.episodes?.find(
          (e) => (episodeId && e.id === episodeId) || (episodeNumber && e.episodeNumber === episodeNumber)
        ) ||
        targetAudio.episodes?.find((e) => e.id === targetAudio.currentEpisodeId || e.episodeNumber === targetAudio.currentEpisodeNumber) ||
        targetAudio.episodes?.[0];
      play(targetAudio, targetEp, pos);
      navigate(`/player/${audioId}`);
    }
  };

  // Skeleton Loader giữ nguyên toàn bộ khối/block/format, làm mờ nền (blur) cho đỡ chói mắt khi backend phản hồi chậm
  const isOtherLoading = isViewingOther && loadingPublicUser;
  const isOwnProfileLoading =
    !isViewingOther &&
    (isLoading || (!isInitialized && !user && Boolean(typeof localStorage !== 'undefined' && localStorage.getItem('auth_token'))));

  if (isOtherLoading || isOwnProfileLoading) {
    return (
      <div className="flex flex-col w-full pb-36 px-4 gap-4 pt-2 fade-in-comic">
        {isViewingOther && (
          <div className="w-20 h-7 rounded bg-gray-200 border border-black animate-pulse" />
        )}

        {/* Profile Card Skeleton */}
        <div className="card-comic p-4 bg-white/70 backdrop-blur-md flex flex-col gap-3 relative overflow-hidden border-2 border-black animate-pulse">
          <div className="flex items-center gap-3">
            {/* Avatar Skeleton */}
            <div className="w-16 h-16 rounded-full border-2 border-black bg-gray-300 flex items-center justify-center shrink-0">
              <i className="ri-loader-4-line text-2xl text-gray-400 animate-spin" />
            </div>

            {/* User Info Skeleton */}
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="h-5 bg-gray-300 rounded-md w-36" />
                <div className="h-4 bg-gray-300 rounded w-16" />
              </div>
              <div className="h-3.5 bg-gray-200 rounded w-48 mt-0.5" />
              <div className="h-3 bg-gray-200 rounded w-28 mt-0.5" />
            </div>
          </div>

          {/* Stats Overview Grid Skeleton */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-black mt-1">
            <div className="card-comic-sm p-2.5 bg-gray-100 flex items-center gap-2 border border-black">
              <div className="w-6 h-6 rounded-md bg-gray-300 shrink-0" />
              <div className="flex flex-col gap-1.5 flex-1">
                <div className="h-2.5 bg-gray-300 rounded w-16" />
                <div className="h-3.5 bg-gray-300 rounded w-20" />
              </div>
            </div>

            <div className="card-comic-sm p-2.5 bg-gray-100 flex items-center gap-2 border border-black">
              <div className="w-6 h-6 rounded-md bg-gray-300 shrink-0" />
              <div className="flex flex-col gap-1.5 flex-1">
                <div className="h-2.5 bg-gray-300 rounded w-16" />
                <div className="h-3.5 bg-gray-300 rounded w-20" />
              </div>
            </div>
          </div>
        </div>

        {/* Stories / Activity Section Skeleton */}
        <div className="card-comic p-4 bg-white/70 backdrop-blur-md flex flex-col gap-3 border-2 border-black animate-pulse">
          <div className="flex items-center justify-between pb-1.5 border-b-2 border-black">
            <div className="h-4 bg-gray-300 rounded w-32" />
            <div className="h-3.5 bg-gray-200 rounded w-16" />
          </div>

          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="card-comic-sm p-3 bg-gray-50 flex items-center justify-between gap-3 border border-gray-300"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-10 h-12 rounded border border-gray-300 bg-gray-200 shrink-0" />
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="h-3.5 bg-gray-300 rounded w-3/4" />
                    <div className="h-2.5 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
                <div className="w-14 h-6 rounded bg-gray-200 border border-gray-300 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // 1. GIAO DIỆN HỒ SƠ CÔNG KHAI CỦA NGƯỜI DÙNG KHÁC (/profile/:id)
  // ========================================================
  if (isViewingOther) {

    if (!publicUser) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center gap-3 fade-in-comic">
          <div className="w-16 h-16 rounded-full border-2 border-black bg-gray-100 flex items-center justify-center shadow-comic">
            <i className="ri-user-unfollow-line text-3xl text-gray-400" />
          </div>
          <h3 className="font-extrabold text-base text-black uppercase">Không tìm thấy người dùng</h3>
          <p className="text-xs text-gray-500 font-semibold">Tài khoản này không tồn tại hoặc đã bị khóa.</p>
          <button onClick={() => navigate(-1)} className="btn-comic btn-comic-primary text-xs py-1.5 px-3">
            <i className="ri-arrow-left-line" /> Quay Lại
          </button>
        </div>
      );
    }

    const isTargetVip = publicUser.role === 'VIP' || publicUser.membership === 'VIP';
    const isTargetAdmin = publicUser.role === 'ADMIN';

    return (
      <div className="flex flex-col w-full pb-36 px-4 gap-4 pt-2 fade-in-comic">
        <button
          onClick={() => navigate(-1)}
          className="btn-comic text-xs py-1.5 px-3 bg-white self-start flex items-center gap-1 shadow-comic-sm"
        >
          <i className="ri-arrow-left-s-line text-base font-bold" /> Quay lại
        </button>

        {/* Public Profile Comic Card */}
        <div className="card-comic p-4 bg-white flex flex-col gap-3 relative overflow-hidden">
          {publicUser.coverUrl && (
            <div
              className="absolute inset-x-0 top-0 h-20 bg-cover bg-center border-b-2 border-black"
              style={{ backgroundImage: `url(${publicUser.coverUrl})` }}
            >
              <div className="absolute inset-0 bg-white/50" />
              <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-white/40 to-transparent" />
            </div>
          )}

          <div className={`flex items-center gap-3 relative z-10 ${publicUser.coverUrl ? 'pt-10' : ''}`}>
            {/* Avatar */}
            <div
              className={`relative w-16 h-16 rounded-full border-3 border-black ${
                isTargetAdmin
                  ? 'bg-[#E63946] text-white'
                  : isTargetVip
                  ? 'bg-[#8338EC] text-white'
                  : 'bg-[#FFE600] text-black'
              } flex items-center justify-center font-black text-2xl shadow-comic-sm shrink-0 overflow-hidden`}
            >
              {publicUser.avatarUrl ? (
                <img src={publicUser.avatarUrl} alt={publicUser.username} className="w-full h-full object-cover" />
              ) : (
                (publicUser.username || 'U').substring(0, 2).toUpperCase()
              )}
              {(isTargetVip || isTargetAdmin) && (
                <span className="absolute -top-1 -right-1 text-base text-[#FFE600]">
                  <i className="ri-vip-crown-fill" />
                </span>
              )}
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-extrabold text-base text-black truncate leading-tight">
                  {publicUser.username}
                </h2>
                <span
                  className={`badge-comic ${
                    isTargetAdmin
                      ? 'badge-comic-red'
                      : isTargetVip
                      ? 'badge-comic-purple'
                      : 'badge-comic-yellow'
                  } text-[9px] font-black`}
                >
                  {publicUser.vipBadge}
                </span>
              </div>
              <span className="text-xs font-semibold text-gray-500 truncate mt-0.5">
                Mã độc giả: #{publicUser.id}
              </span>
            </div>
          </div>

          {/* Stats Overview Grid */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-black mt-1">
            <div className="card-comic-sm p-2 bg-[#FEF9C3] flex items-center gap-2 border border-black">
              <i className="ri-headphone-fill text-xl text-[#3A86FF]" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-600">Đã cày truyện</span>
                <span className="font-black text-xs text-black">{publicUser.totalHours} giờ</span>
              </div>
            </div>

            <div className="card-comic-sm p-2 bg-[#E0F2FE] flex items-center gap-2 border border-black">
              <i className="ri-book-open-fill text-xl text-[#0284C7]" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-600">Kho truyện chia sẻ</span>
                <span className="font-black text-xs text-black">{publicUser.uploadCount} bộ</span>
              </div>
            </div>
          </div>
        </div>

        {/* Uploaded Audios by Target User */}
        <div className="card-comic p-4 bg-white flex flex-col gap-3">
          <div className="flex items-center justify-between pb-1.5 border-b-2 border-black">
            <div className="flex items-center gap-1.5">
              <i className="ri-disc-fill text-[#3A86FF] text-base" />
              <span className="font-extrabold text-xs uppercase text-black">
                Truyện Đã Chia Sẻ ({otherAudios.length})
              </span>
            </div>
            {otherAudios.length > 0 && (
              <button
                onClick={() => navigate(`/library?userId=${publicUser.id}`)}
                className="badge-comic badge-comic-blue text-[9px] py-0.5 px-2 font-bold hover:underline"
              >
                Xem trong Thư Viện →
              </button>
            )}
          </div>

          {loadingOtherAudios ? (
            <LoadingState message="Đang tải danh sách truyện..." />
          ) : otherAudios.length === 0 ? (
            <span className="text-xs font-semibold text-gray-500 py-6 text-center">
              Độc giả này chưa đăng tải bộ truyện nào lên cộng đồng.
            </span>
          ) : (
            <div className="flex flex-col gap-2">
              {paginatedOtherAudios.map((audio) => (
                <div
                  key={audio.id}
                  className="card-comic-sm p-2.5 flex items-center justify-between gap-2.5 hover:bg-gray-50 transition-all border border-black"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={audio.thumbnailUrl}
                      alt={audio.title}
                      className="w-10 h-12 rounded border border-black object-cover shrink-0 bg-black"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-extrabold text-xs text-black truncate leading-tight">{audio.title}</span>
                      <span className="text-[10px] font-semibold text-gray-500">
                        {audio.totalEpisodes || audio.episodes?.length || 1} Tập • {audio.formattedDuration || '24h 00m'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/player/${audio.id}`)}
                    className="btn-comic btn-comic-primary text-[10px] py-1 px-2.5 shrink-0"
                  >
                    <i className="ri-play-fill" /> Nghe
                  </button>
                </div>
              ))}

              {totalOtherAudiosPages > 1 && (
                <Pagination
                  currentPage={safeOtherAudiosPage}
                  totalPages={totalOtherAudiosPages}
                  totalItems={otherAudios.length}
                  pageSize={pageSize}
                  onPageChange={(p) => setOtherAudiosPage(p)}
                />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 0. Giao diện riêng biệt dành cho Khách Vãng Lai (Chưa có tài khoản)
  if (user?.isGuest) {
    return (
      <div className="flex flex-col w-full pb-36 px-4 gap-4 pt-2 fade-in-comic">
        {/* Guest Profile Card */}
        <div className="card-comic p-4 bg-white flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-full border-3 border-black bg-[#FFE600] text-black flex items-center justify-center font-black text-2xl shadow-comic-sm shrink-0">
              <i className="ri-user-smile-fill text-3xl" />
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-base text-black truncate leading-tight">
                  Khách Nghe Thử
                </h2>
                <span className="badge-comic badge-comic-yellow text-[9px] font-black">
                  CHƯA ĐĂNG NHẬP
                </span>
              </div>
              <span className="text-xs font-semibold text-gray-500 truncate mt-0.5">
                Chế độ khách vãng lai • Chưa có tài khoản
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="badge-comic badge-comic-white text-[9px] py-0.5 px-1.5 font-bold">
                  Trạng thái: <strong>Khách vãng lai</strong>
                </span>
              </div>
            </div>
          </div>

         
        </div>

        {/* Nút Đăng Ký / Đăng Nhập dành cho Khách */}
        <div className="card-comic p-4 bg-[#FFE600] flex flex-col gap-3 border-2 border-black">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl border-2 border-black bg-white flex items-center justify-center text-black font-black shadow-comic-sm shrink-0">
              <i className="ri-user-star-fill text-xl text-[#FF0055]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-sm uppercase text-black leading-tight">
                Đăng Nhập / Tạo Tài Khoản
              </span>
              <span className="text-xs font-bold text-gray-800 leading-tight mt-0.5">
                Đăng nhập để giữ lại toàn bộ lịch sử nghe và tiến trình khi đổi thiết bị!
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => navigate('/login')}
              className="btn-comic btn-comic-primary text-xs py-2.5 font-black flex items-center justify-center gap-1.5 shadow-comic"
            >
              <i className="ri-login-box-line font-bold text-sm" /> Đăng Nhập
            </button>
            <button
              onClick={() => navigate('/register')}
              className="btn-comic btn-comic-white text-xs py-2.5 font-black flex items-center justify-center gap-1.5 shadow-comic hover:bg-gray-100"
            >
              <i className="ri-user-add-line font-bold text-sm" /> Đăng Ký Mới
            </button>
          </div>
        </div>

        {/* Lịch Sử Nghe Tạm Trong Phiên (chỉ hiển thị nếu khách đã nghe truyện trong phiên này) */}
        {history.length > 0 && (
          <div className="card-comic p-4 bg-white flex flex-col gap-3">
            <div className="flex items-center justify-between pb-1.5 border-b-2 border-black">
              <span className="font-extrabold text-xs uppercase text-black">Tiến Trình Nghe Tạm Trong Phiên</span>
              <span className="badge-comic badge-comic-yellow text-[9px] font-black">{history.length} BỘ TRUYỆN</span>
            </div>

            <div className="flex flex-col gap-2.5">
              {paginatedHistory.map((item) => {
                const progress = item.progressPercent || 0;
                const title = item.title || 'Truyện Audio';
                const epTitle = item.currentEpisodeTitle || 'Tập 1';
                const pos = item.formattedPosition || '00:00:00';

                return (
                  <div
                    key={`${item.audioId}-${item.episodeId}`}
                    className="card-comic-sm p-3 flex flex-col gap-2 hover:bg-gray-50 transition-all border-2 border-black"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={item.thumbnailUrl || 'https://img.youtube.com/vi/placeholder/hqdefault.jpg'}
                          alt={title}
                          className="w-12 h-14 rounded border border-black object-cover shrink-0 bg-black"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="font-extrabold text-xs text-black truncate leading-tight">{title}</span>
                          <span className="text-[11px] font-semibold text-gray-600 truncate mt-0.5">
                            {epTitle} • Mốc: <strong>{pos}</strong>
                          </span>
                          <span className="text-[10px] font-mono text-gray-500">
                            Đã nghe: {Math.round((item.totalDurationListened || 60) / 60)} phút (Lưu tạm)
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          handleResumeHistory(
                            item.audioId,
                            item.lastPositionSeconds || 0,
                            item.currentEpisodeId,
                            item.currentEpisodeNumber
                          )
                        }
                        className="btn-comic btn-comic-primary text-[10px] py-1.5 px-3 shrink-0 flex items-center gap-1"
                      >
                        <i className="ri-play-fill font-bold" /> Nghe tiếp
                      </button>
                    </div>
                    <div className="w-full bg-gray-200 h-1.5 rounded-full border border-black overflow-hidden">
                      <div className="h-full bg-[#3A86FF]" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                );
              })}

              {totalHistoryPages > 1 && (
                <Pagination
                  currentPage={safeHistoryPage}
                  totalPages={totalHistoryPages}
                  totalItems={history.length}
                  pageSize={pageSize}
                  onPageChange={(p) => setHistoryPage(p)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full pb-36 px-4 gap-4 pt-2 fade-in-comic">
      {/* 1. Profile Comic Card */}
      <div className="card-comic p-4 bg-white flex flex-col gap-3 relative overflow-hidden">
       {user?.coverUrl && (
  <div
    className="absolute inset-x-0 top-0 h-20 bg-cover bg-center border-b-2 border-black"
    style={{ backgroundImage: `url(${user.coverUrl})` }}
  >
    {/* Overlay làm dịu màu ảnh */}
    <div className="absolute inset-0 bg-white/50" />

    {/* Gradient trắng tăng độ tương phản cho vùng text */}
    <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-white/40 to-transparent" />
  </div>
)}
        <div className={`flex items-center gap-3 relative z-10 ${user?.coverUrl ? 'pt-10' : ''}`}>
          {/* Avatar */}
          <div
            className={`relative w-16 h-16 rounded-full border-3 border-black ${
              user?.role === 'ADMIN'
                ? 'bg-[#E63946] text-white'
                : user?.role === 'VIP'
                ? 'bg-[#8338EC] text-white'
                : 'bg-[#FFE600] text-black'
            } flex items-center justify-center font-black text-2xl shadow-comic-sm shrink-0 overflow-hidden`}
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
            ) : (
              (user?.username || 'K').substring(0, 2).toUpperCase()
            )}
            {isVipOrAdmin && (
              <span className="absolute -top-1 -right-1 text-base text-[#FFE600]">
                <i className="ri-vip-crown-fill" />
              </span>
            )}
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-base text-black truncate leading-tight">
                {user?.username || 'Khách'}
              </h2>
              <span
                className={`badge-comic ${
                  user?.role === 'ADMIN'
                    ? 'badge-comic-red'
                    : user?.role === 'VIP'
                    ? 'badge-comic-purple'
                    : 'badge-comic-yellow'
                } text-[9px] font-black`}
              >
                {user?.role || 'GUEST'}
              </span>
            </div>
            <span className="text-xs font-semibold text-gray-500 truncate mt-0.5">
              {user?.email || (user?.isGuest ? 'Khách vãng lai' : 'Chưa có email')}
            </span>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span
                className={`badge-comic ${
                  user?.role === 'VIP' ? 'badge-comic-purple' : 'badge-comic-white'
                } text-[9px] py-0.5 px-1.5 font-bold flex items-center gap-1`}
              >
                {user?.role === 'VIP' && <i className="ri-vip-crown-fill text-[#FFE600]" />}
                Hội viên: <strong>{user?.role === 'VIP' ? 'VIP' : user?.role === 'ADMIN' ? 'ADMIN' : 'FREE'}</strong>{' '}
                {vipCountdown}
              </span>
            </div>
          </div>
        </div>

        {/* Quota Progress Bar */}
        <div className="card-comic-sm p-2.5 bg-[#FEF9C3] flex flex-col gap-1 border border-black mt-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-black">
            <span>Hạn mức Import YouTube hôm nay:</span>
            <span>
              {isVipOrAdmin
                ? 'Không giới hạn'
                : `Đã dùng ${importQuota?.todayImportCount ?? 0}/${importQuota?.maxImportsPerDay ?? 5}`}
            </span>
          </div>
          <div className="w-full bg-white h-2 rounded-full border border-black overflow-hidden shadow-comic-sm">
            <div
              className="h-full bg-[#3A86FF] transition-all duration-300"
              style={{
                width: isVipOrAdmin
                  ? '100%'
                  : `${Math.min(
                      100,
                      (((importQuota?.todayImportCount ?? 0) / (importQuota?.maxImportsPerDay ?? 5)) * 100)
                    )}%`,
              }}
            />
          </div>
        </div>

        {/* Quick Action Buttons Row */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-black">
          <button
            onClick={() => {
              setNewUsername(user?.username || '');
              setIsEditNameOpen(true);
            }}
            className="btn-comic text-xs py-1.5 bg-gray-100"
          >
            <i className="ri-edit-line" /> Sửa Tên
          </button>
          <button
            onClick={() => {
              setOldPassword('');
              setNewPassword('');
              setIsChangePasswordOpen(true);
            }}
            className="btn-comic text-xs py-1.5 bg-gray-100"
          >
            <i className="ri-lock-password-line" /> Đổi Mật Khẩu
          </button>
        </div>
      </div>

      {/* 2. Guest Upgrade Banner if Guest */}
      {user?.isGuest && (
        <div className="card-comic p-4 bg-[#FFE600] flex flex-col gap-2 border-2 border-black">
          <div className="flex items-center gap-2">
            <i className="ri-user-star-fill text-xl text-black" />
            <span className="font-extrabold text-xs uppercase text-black">Nâng Cấp Tài Khoản Chính Thức</span>
          </div>
          <p className="text-xs font-bold text-gray-800">
            Đăng ký tài khoản để giữ lại toàn bộ lịch sử nghe và tiến trình khi đổi thiết bị!
          </p>
          <button onClick={() => navigate('/login')} className="btn-comic btn-comic-primary text-xs py-2">
            Đăng Ký / Đăng Nhập Ngay
          </button>
        </div>
      )}

      {/* 3. VIP Banner if not VIP */}
      {!isVipOrAdmin && (
        <div
          onClick={() => navigate('/membership')}
          className="card-comic p-3.5 bg-[#8338EC] text-white flex items-center justify-between cursor-pointer shadow-comic-md"
        >
          <div className="flex items-center gap-2.5">
            <i className="ri-vip-crown-fill text-2xl text-[#FFE600]" />
            <div className="flex flex-col">
              <span className="font-extrabold text-xs uppercase text-white">Nâng Cấp Gói VIP</span>
              <span className="text-[11px] font-semibold text-white/90">
                Mở khóa truyện độc quyền & Không giới hạn import
              </span>
            </div>
          </div>
          <i className="ri-arrow-right-s-line text-xl font-bold" />
        </div>
      )}

      

      {/* 4. Lịch Sử Cày Truyện Cá Nhân */}
      <div className="card-comic p-4 bg-white flex flex-col gap-3">
        <div className="flex items-center justify-between pb-1.5 border-b-2 border-black">
          <span className="font-extrabold text-xs uppercase text-black">Nhật Ký Cày Truyện Của Bạn</span>
          <span className="badge-comic badge-comic-yellow text-[9px] font-black">{history.length} BỘ TRUYỆN</span>
        </div>

        <div className="flex flex-col gap-2.5">
          {history.length === 0 ? (
            <span className="text-xs font-semibold text-gray-500 py-3 text-center">Chưa có nhật ký nghe nào</span>
          ) : (
            <>
              {paginatedHistory.map((item) => {
                const progress = item.progressPercent || 0;
                const title = item.title || 'Truyện Audio';
                const epTitle = item.currentEpisodeTitle || 'Tập 1';
                const pos = item.formattedPosition || '00:00:00';

                return (
                  <div
                    key={`${item.audioId}-${item.episodeId}`}
                    className="card-comic-sm p-3 flex flex-col gap-2 hover:bg-gray-50 transition-all border-2 border-black"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={item.thumbnailUrl || 'https://img.youtube.com/vi/placeholder/hqdefault.jpg'}
                          alt={title}
                          className="w-12 h-14 rounded border border-black object-cover shrink-0 bg-black"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="font-extrabold text-xs text-black truncate leading-tight">{title}</span>
                          <span className="text-[11px] font-semibold text-gray-600 truncate mt-0.5">
                            {epTitle} • Mốc: <strong>{pos}</strong>
                          </span>
                          <span className="text-[10px] font-mono text-gray-500">
                            Đã nghe: {Math.round((item.totalDurationListened || 60) / 60)} phút
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          handleResumeHistory(
                            item.audioId,
                            item.lastPositionSeconds || 0,
                            item.currentEpisodeId,
                            item.currentEpisodeNumber
                          )
                        }
                        className="btn-comic btn-comic-primary text-[10px] py-1.5 px-3 shrink-0 flex items-center gap-1"
                      >
                        <i className="ri-play-fill font-bold" /> Nghe tiếp
                      </button>
                    </div>
                    <div className="w-full bg-gray-200 h-1.5 rounded-full border border-black overflow-hidden">
                      <div className="h-full bg-[#3A86FF]" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                );
              })}

              <Pagination
                currentPage={safeHistoryPage}
                totalPages={totalHistoryPages}
                totalItems={history.length}
                pageSize={pageSize}
                onPageChange={(p) => setHistoryPage(p)}
              />
            </>
          )}
        </div>
      </div>

      {/* 5. Truyện Do Tôi Nhập */}
      <div className="card-comic p-4 bg-white flex flex-col gap-3">
        <div className="flex items-center justify-between pb-1.5 border-b-2 border-black">
          <span className="font-extrabold text-xs uppercase text-black">Truyện Do Bạn Nhập</span>
          <div className="flex items-center gap-2">
            <span className="badge-comic badge-comic-teal text-[9px] font-black">{myAudios.length} BỘ</span>
            {user?.id && (
              <button
                onClick={() => navigate(`/library?userId=${user.id}`)}
                className="badge-comic badge-comic-blue text-[9px] py-0.5 px-2 font-bold hover:underline"
              >
                Xem trong Thư Viện →
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {myAudios.length === 0 ? (
            <span className="text-xs font-semibold text-gray-500 py-3 text-center">
              Bạn chưa nhập video YouTube nào
            </span>
          ) : (
            <>
              {paginatedMyAudios.map((audio) => (
                <div
                  key={audio.id}
                  className="card-comic-sm p-2.5 flex items-center justify-between gap-2.5 hover:bg-gray-50 transition-all border border-black"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={audio.thumbnailUrl}
                      alt={audio.title}
                      className="w-10 h-12 rounded border border-black object-cover shrink-0 bg-black"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-extrabold text-xs text-black truncate leading-tight">{audio.title}</span>
                      <span className="text-[10px] font-semibold text-gray-500">
                        {audio.totalEpisodes || audio.episodes?.length || 1} Tập • {audio.formattedDuration || '24h 00m'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/player/${audio.id}`)}
                    className="btn-comic text-[10px] py-1 px-2.5 bg-gray-100 shrink-0"
                  >
                    <i className="ri-play-fill" /> Xem
                  </button>
                </div>
              ))}

              <Pagination
                currentPage={safeMyAudiosPage}
                totalPages={totalMyAudiosPages}
                totalItems={myAudios.length}
                pageSize={pageSize}
                onPageChange={(p) => setMyAudiosPage(p)}
              />
            </>
          )}
        </div>
      </div>

      {/* 6. Logout Button */}
      <button
        onClick={() => setIsLogoutModalOpen(true)}
        className="btn-comic btn-comic-red text-xs py-3 font-black shadow-comic mt-2"
      >
        <i className="ri-logout-box-line text-base font-bold" /> Đăng Xuất Tài Khoản
      </button>

      {/* Edit Name Modal */}
      <Modal
        isOpen={isEditNameOpen}
        onClose={() => setIsEditNameOpen(false)}
        title="ĐỔI TÊN ĐỘC GIẢ"
        confirmText="Lưu Tên"
        onConfirm={handleUpdateName}
      >
        <div className="flex flex-col gap-1.5">
          <label className="font-extrabold text-[11px] uppercase text-black">Tên người dùng mới</label>
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="input-comic text-xs py-1.5"
          />
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        title="ĐỔI MẬT KHẨU"
        confirmText="Đổi Mật Khẩu"
        onConfirm={handleChangePassword}
      >
        <div className="flex flex-col gap-1.5">
          <label className="font-extrabold text-[11px] uppercase text-black">Mật khẩu hiện tại</label>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="input-comic text-xs py-1.5"
            placeholder="••••••••"
          />
          <label className="font-extrabold text-[11px] uppercase text-black mt-0.5">Mật khẩu mới</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input-comic text-xs py-1.5"
            placeholder="••••••••"
          />
        </div>
      </Modal>

      {/* Logout Modal */}
      <Modal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        title="ĐĂNG XUẤT?"
        confirmText="Đăng Xuất"
        isDanger
        onConfirm={handleLogout}
      >
        <p className="text-xs font-semibold text-gray-800 leading-snug">Bạn có chắc chắn muốn đăng xuất khỏi ứng dụng?</p>
      </Modal>
    </div>
  );
};

