'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, Scissors, Crown } from 'lucide-react';
import { useAudios, useAudioEpisodes } from '@/hooks/useAudio';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { Episode } from '@/types';
import { AdminTabs } from './AdminTabs';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { formatTime } from '@/lib/utils';
import { AdminTableSkeleton } from '@/components/common/Skeletons';
import { Pagination } from '@/components/ui/Pagination';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';

export const AdminEpisodesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const urlAudioId = searchParams.get('audioId') ? Number(searchParams.get('audioId')) : null;

  const { data: audios = [], isLoading: audiosLoading } = useAudios();
  const [selectedAudioId, setSelectedAudioId] = useState<number | null>(urlAudioId);

  useEffect(() => {
    if (audios.length > 0 && !selectedAudioId) {
      const initial = urlAudioId || audios[0].id;
      setSelectedAudioId(initial);
    }
  }, [audios, selectedAudioId, urlAudioId]);

  const selectedAudio = audios.find((a) => a.id === selectedAudioId) || audios[0];

  const { data: episodes = [], isLoading: episodesLoading } = useAudioEpisodes(selectedAudio?.id);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = DEFAULT_PAGE_SIZE;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedAudioId]);

  const totalPages = Math.max(1, Math.ceil(episodes.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedEpisodes = episodes.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  const [rechunkBlockSize, setRechunkBlockSize] = useState<number>(14400);
  const [isRechunking, setIsRechunking] = useState(false);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEpTitle, setNewEpTitle] = useState('');
  const [newEpStart, setNewEpStart] = useState(0);
  const [newEpEnd, setNewEpEnd] = useState(14400);

  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);
  const [editEpTitle, setEditEpTitle] = useState('');
  const [editEpStart, setEditEpStart] = useState(0);
  const [editEpEnd, setEditEpEnd] = useState(14400);

  const [deletingEpisodeId, setDeletingEpisodeId] = useState<number | null>(null);

  const showSkeletonFallback = useDelayedFallback(
    (episodesLoading || audiosLoading) && episodes.length === 0,
    180
  );

  const handleSelectAudio = (id: number) => {
    setSelectedAudioId(id);
    setSearchParams({ audioId: String(id) });
  };

  const handleRechunk = async () => {
    if (!selectedAudio) return;
    setIsRechunking(true);
    try {
      toast.info('Đang tính toán và chia lại tập in-place...');
      await api.episode.generateEpisodes(
        selectedAudio.id,
        rechunkBlockSize,
        selectedAudio.totalDurationSeconds || 0
      );
      queryClient.invalidateQueries({ queryKey: ['episodes', selectedAudio.id] });
      queryClient.invalidateQueries({ queryKey: ['audios'] });
      toast.success('Đã chia lại tập thành công!');
    } catch {
      toast.error('Lỗi khi chia lại tập');
    } finally {
      setIsRechunking(false);
    }
  };

  const openAddEpisode = () => {
    const nextEpNum = episodes.length + 1;
    const lastEp = episodes[episodes.length - 1];
    const defaultStart = lastEp ? lastEp.endSeconds : 0;
    const defaultEnd = defaultStart + 14400;

    setNewEpTitle(`Tập ${nextEpNum}`);
    setNewEpStart(defaultStart);
    setNewEpEnd(defaultEnd);
    setIsAddModalOpen(true);
  };

  const handleCreateEpisode = async () => {
    if (!selectedAudio) return false;
    if (!newEpTitle.trim() || newEpEnd <= newEpStart) {
      toast.error('Thời gian kết thúc phải lớn hơn thời gian bắt đầu');
      return false;
    }
    try {
      toast.info('Đang tạo tập mới...');
      await api.episode.createEpisode({
        audioId: selectedAudio.id,
        episodeNumber: episodes.length + 1,
        title: newEpTitle.trim(),
        startSeconds: newEpStart,
        endSeconds: newEpEnd,
        duration: newEpEnd - newEpStart,
      });
      queryClient.invalidateQueries({ queryKey: ['episodes', selectedAudio.id] });
      toast.success('Đã thêm tập mới thành công!');
      setIsAddModalOpen(false);
      return true;
    } catch {
      toast.error('Lỗi khi tạo tập');
      return false;
    }
  };

  const openEditEpisode = (ep: Episode) => {
    setEditingEpisode(ep);
    setEditEpTitle(ep.title);
    setEditEpStart(ep.startSeconds);
    setEditEpEnd(ep.endSeconds);
  };

  const handleSaveEditEpisode = async () => {
    if (!editingEpisode || !selectedAudio) return false;
    if (!editEpTitle.trim() || editEpEnd <= editEpStart) {
      toast.error('Thời gian kết thúc phải lớn hơn thời gian bắt đầu');
      return false;
    }
    try {
      toast.info('Đang cập nhật tập...');
      await api.episode.updateEpisode(editingEpisode.id, {
        title: editEpTitle.trim(),
        startSeconds: editEpStart,
        endSeconds: editEpEnd,
        duration: editEpEnd - editEpStart,
      });
      queryClient.invalidateQueries({ queryKey: ['episodes', selectedAudio.id] });
      toast.success('Đã cập nhật tập!');
      setEditingEpisode(null);
      return true;
    } catch {
      toast.error('Lỗi khi cập nhật tập');
      return false;
    }
  };

  const handleDeleteEpisode = async () => {
    if (!deletingEpisodeId || !selectedAudio) return;
    try {
      toast.info('Đang xóa tập...');
      await api.episode.deleteEpisode(deletingEpisodeId);
      queryClient.invalidateQueries({ queryKey: ['episodes', selectedAudio.id] });
      toast.success('Đã xóa tập!');
      setDeletingEpisodeId(null);
    } catch {
      toast.error('Lỗi khi xóa tập');
    }
  };

  return (
    <div className="flex flex-col w-full pb-36 md:pb-28 fade-in-comic">
      <AdminTabs activeTab="episodes" />

      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          <div className="card-comic p-4 flex flex-col justify-center gap-2">
            <label
              className="font-extrabold text-xs uppercase text-[var(--ink-primary)]"
              htmlFor="admin-audio-select"
            >
              Chọn Bộ Audio Cần Quản Lý Tập:
            </label>
            <select
              id="admin-audio-select"
              value={selectedAudio?.id || ''}
              onChange={(e) => handleSelectAudio(Number(e.target.value))}
              className="input-comic text-xs font-bold"
            >
              {audios.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({a.totalEpisodes || a.episodes?.length || 1} tập -{' '}
                  {a.formattedDuration || '24h'})
                </option>
              ))}
            </select>
          </div>

          <div className="card-comic p-4 bg-[var(--surface-accent-soft)] flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[var(--ink-primary)]" />
                <span className="font-extrabold text-xs uppercase text-[var(--ink-primary)]">
                  Tự Động Chia Lại Tập In-Place
                </span>
              </div>
              <span className="badge-comic badge-comic-teal text-[8px]">AN TOÀN TIẾN TRÌNH</span>
            </div>
            <p className="text-xs font-medium text-[var(--ink-secondary)]">
              Cắt lại tập tự động không làm mất ID và giữ nguyên lịch sử nghe của người dùng.
            </p>

            <div className="flex items-center gap-2">
              <select
                value={rechunkBlockSize}
                onChange={(e) => setRechunkBlockSize(Number(e.target.value))}
                className="input-comic text-xs font-bold flex-1 min-w-0"
              >
                <option value={14400}>Khối 4 Tiếng (Chuẩn mặc định)</option>
                <option value={7200}>Khối 2 Tiếng</option>
                <option value={3600}>Khối 1 Tiếng</option>
                <option value={1800}>Khối 30 Phút</option>
              </select>
              <button
                type="button"
                onClick={handleRechunk}
                disabled={isRechunking}
                className="btn-comic btn-comic-primary text-xs py-2 px-3.5 whitespace-nowrap shrink-0"
              >
                <Scissors className={`w-3.5 h-3.5 ${isRechunking ? 'animate-spin' : ''}`} />
                <span>Chia Lại</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
            Danh sách phân tập ({episodes.length})
          </span>
          <button
            type="button"
            onClick={openAddEpisode}
            className="btn-comic btn-comic-yellow text-xs py-1.5 px-3"
          >
            + Thêm Tập Mới
          </button>
        </div>

        {showSkeletonFallback ? (
          <AdminTableSkeleton rows={4} />
        ) : episodes.length === 0 ? (
          <div className="card-comic p-6 text-center text-xs font-bold text-[var(--ink-secondary)]">
            Bộ audio này chưa có tập nào.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {paginatedEpisodes.map((ep) => (
                <div
                  key={ep.id}
                  className="card-comic-sm p-3 bg-[var(--surface-card)] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg border-2 border-[#111113] bg-[#FFE600] flex items-center justify-center font-black text-xs text-[#111113] shrink-0 shadow-comic-sm">
                      T{ep.episodeNumber}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate leading-tight">
                          {ep.title}
                        </span>
                        {Boolean(
                          selectedAudio?.isVIPOnly || selectedAudio?.isVipOnly || ep.isVip
                        ) && (
                          <span className="badge-comic badge-comic-purple text-[8px] py-0 px-1 font-black shrink-0">
                            <Crown className="w-2.5 h-2.5" /> VIP{' '}
                            {ep.episodeNumber === 1 ? '(PREVIEW)' : ''}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-[var(--ink-secondary)] truncate mt-0.5">
                        {formatTime(ep.startSeconds)} → {formatTime(ep.endSeconds)} (
                        {Math.round(((ep.endSeconds - ep.startSeconds) / 3600) * 10) / 10}h)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditEpisode(ep)}
                      className="btn-comic text-[11px] py-1 px-2.5"
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingEpisodeId(ep.id)}
                      className="btn-comic btn-comic-red text-[11px] py-1 px-2.5"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Pagination
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              totalItems={episodes.length}
              pageSize={pageSize}
              onPageChange={(p) => {
                setCurrentPage(p);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        )}
      </div>

      {/* Add Episode Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="THÊM TẬP MỚI"
        confirmText="Tạo Tập"
        onConfirm={handleCreateEpisode}
        size="sm"
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
              Tiêu đề tập
            </label>
            <input
              type="text"
              value={newEpTitle}
              onChange={(e) => setNewEpTitle(e.target.value)}
              className="input-comic text-xs py-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
                Bắt đầu (giây)
              </label>
              <input
                type="number"
                value={newEpStart}
                onChange={(e) => setNewEpStart(Number(e.target.value))}
                className="input-comic text-xs py-1.5"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
                Kết thúc (giây)
              </label>
              <input
                type="number"
                value={newEpEnd}
                onChange={(e) => setNewEpEnd(Number(e.target.value))}
                className="input-comic text-xs py-1.5"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Edit Episode Modal */}
      <Modal
        isOpen={Boolean(editingEpisode)}
        onClose={() => setEditingEpisode(null)}
        title="SỬA TẬP AUDIO"
        confirmText="Lưu"
        onConfirm={handleSaveEditEpisode}
        size="sm"
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
              Tiêu đề tập
            </label>
            <input
              type="text"
              value={editEpTitle}
              onChange={(e) => setEditEpTitle(e.target.value)}
              className="input-comic text-xs py-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
                Bắt đầu (giây)
              </label>
              <input
                type="number"
                value={editEpStart}
                onChange={(e) => setEditEpStart(Number(e.target.value))}
                className="input-comic text-xs py-1.5"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
                Kết thúc (giây)
              </label>
              <input
                type="number"
                value={editEpEnd}
                onChange={(e) => setEditEpEnd(Number(e.target.value))}
                className="input-comic text-xs py-1.5"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Episode Modal */}
      <Modal
        isOpen={Boolean(deletingEpisodeId)}
        onClose={() => setDeletingEpisodeId(null)}
        title="XÓA TẬP NÀY?"
        isDanger
        confirmText="Xóa Tập"
        onConfirm={handleDeleteEpisode}
        size="sm"
      >
        <p className="text-xs font-semibold text-[var(--ink-secondary)] leading-snug">
          Bạn có chắc chắn muốn xóa tập này? Thời gian phát của truyện sẽ được cập nhật lại.
        </p>
      </Modal>
    </div>
  );
};
