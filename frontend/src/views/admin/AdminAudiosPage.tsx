'use client';

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Plus,
  Crown,
  Play,
  Scissors,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useAudios, useUpdateAudio, useDeleteAudio } from '@/hooks/useAudio';
import { useCategories } from '@/hooks/useCategories';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { AudioItem } from '@/types';
import { AdminTabs } from './AdminTabs';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { AdminTableSkeleton } from '@/components/common/Skeletons';
import { Pagination } from '@/components/ui/Pagination';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';

export const AdminAudiosPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data: audios = [], isLoading } = useAudios();
  const { data: categories = [] } = useCategories();
  const updateAudioMutation = useUpdateAudio();
  const deleteAudioMutation = useDeleteAudio();

  const [editingAudio, setEditingAudio] = useState<AudioItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<number>(1);
  const [editTags, setEditTags] = useState('');
  const [editVip, setEditVip] = useState(false);
  const [editFreeEpisodesCount, setEditFreeEpisodesCount] = useState<number>(1);

  const [deletingAudioId, setDeletingAudioId] = useState<number | null>(null);

  const filteredAudios = audios.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.author.toLowerCase().includes(search.toLowerCase()) ||
      a.youtubeVideoId.toLowerCase().includes(search.toLowerCase())
  );

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = DEFAULT_PAGE_SIZE;

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filteredAudios.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedAudios = filteredAudios.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  const showSkeletonFallback = useDelayedFallback(isLoading && audios.length === 0, 180);

  const openEditModal = (a: AudioItem) => {
    setEditingAudio(a);
    setEditTitle(a.title);
    setEditAuthor(a.author || '');
    setEditDesc(a.description || '');
    setEditCategoryId(a.categoryId || categories[0]?.id || 1);
    setEditTags((a.tags || []).join(', '));
    setEditVip(Boolean(a.isVIPOnly || a.isVipOnly));
    setEditFreeEpisodesCount(a.freeEpisodesCount !== undefined ? a.freeEpisodesCount : 1);
  };

  const handleSaveEdit = async () => {
    if (!editingAudio) return false;
    if (!editTitle.trim()) {
      toast.error('Tiêu đề không được để trống');
      return false;
    }
    try {
      toast.info('Đang cập nhật audio...');
      const tagsArray = editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await updateAudioMutation.mutateAsync({
        id: editingAudio.id,
        data: {
          title: editTitle.trim(),
          author: editAuthor.trim(),
          description: editDesc.trim(),
          categoryId: editCategoryId,
          tags: tagsArray,
          isVIPOnly: editVip,
          isVipOnly: editVip,
          freeEpisodesCount: editVip ? Math.max(0, Number(editFreeEpisodesCount)) : 1,
        },
      });
      toast.success('Cập nhật audio thành công!');
      setEditingAudio(null);
      return true;
    } catch {
      toast.error('Lỗi khi cập nhật audio');
      return false;
    }
  };

  const handleDeleteAudio = async () => {
    if (!deletingAudioId) return;
    try {
      toast.info('Đang xóa audio...');
      await deleteAudioMutation.mutateAsync(deletingAudioId);
      toast.success('Đã xóa audio thành công');
      setDeletingAudioId(null);
    } catch {
      toast.error('Lỗi khi xóa audio');
    }
  };

  return (
    <div className="flex flex-col w-full pb-36 md:pb-28 fade-in-comic">
      <AdminTabs activeTab="audios" />

      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2.5 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none z-10" />
            <input
              type="text"
              placeholder="Tìm theo tên truyện, tác giả, video ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-comic pl-9 pr-8 text-xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center border border-[var(--border-ink)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] z-10 cursor-pointer"
                title="Xóa tìm kiếm"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('/upload')}
            className="btn-comic btn-comic-yellow text-xs py-2 px-3.5 shrink-0"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            <span>Thêm Audio</span>
          </button>
        </div>

        {showSkeletonFallback ? (
          <AdminTableSkeleton rows={4} />
        ) : filteredAudios.length === 0 ? (
          <div className="card-comic p-6 text-center text-xs font-bold text-[var(--ink-secondary)]">
            Không tìm thấy audio nào phù hợp.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {paginatedAudios.map((a) => (
                <div key={a.id} className="card-comic p-3.5 flex flex-col justify-between gap-2.5">
                  <div className="flex items-start gap-3">
                    <img
                      src={a.thumbnailUrl || '/wavelink-icon.png'}
                      alt={a.title}
                      className="w-16 h-20 rounded-xl border-2 border-[var(--border-ink)] object-cover shrink-0 bg-[#111113] shadow-comic-sm"
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="badge-comic badge-comic-blue text-[9px] py-0 px-1.5 font-bold">
                            {a.categoryName || 'Chung'}
                          </span>
                          {Boolean(a.isVIPOnly || a.isVipOnly) && (
                            <span className="badge-comic badge-comic-purple text-[8px] py-0 px-1 font-black">
                              <Crown className="w-2.5 h-2.5" /> VIP
                            </span>
                          )}
                        </div>
                        <span
                          className={`badge-comic ${
                            a.status === 'ACTIVE' || !a.status
                              ? 'badge-comic-teal'
                              : 'badge-comic-white'
                          } text-[8px] py-0 px-1`}
                        >
                          {a.status === 'ACTIVE' || !a.status ? 'ACTIVE' : 'HIDDEN'}
                        </span>
                      </div>
                      <h3 className="font-extrabold text-xs sm:text-sm text-[var(--ink-primary)] truncate mt-1">
                        {a.title}
                      </h3>
                      <p className="text-[11px] font-semibold text-[var(--ink-muted)] truncate mt-0.5">
                        Tác giả: {a.author || 'Chưa rõ'}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-mono font-bold flex-wrap">
                        <span className="badge-comic badge-comic-yellow text-[8px] py-0 px-1">
                          {a.totalEpisodes || a.episodes?.length || 1} Tập
                        </span>
                        <span className="badge-comic badge-comic-white text-[8px] py-0 px-1">
                          {a.formattedDuration || '24h 00m'}
                        </span>
                        <span className="text-[var(--ink-muted)] truncate">
                          ID: {a.youtubeVideoId}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border-ink)]/30 mt-1 gap-2">
                    <span className="text-xs font-bold text-[var(--ink-secondary)]">
                      Tiến độ: <strong className="text-[#3A86FF]">{a.progressPercent || 0}%</strong>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => navigate(`/player/${a.id}`)}
                        className="btn-comic text-[11px] py-1 px-2"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Nghe</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/episodes?audioId=${a.id}`)}
                        className="btn-comic text-[11px] py-1 px-2"
                      >
                        <Scissors className="w-3 h-3" />
                        <span>Tập</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(a)}
                        className="btn-comic text-[11px] py-1 px-2"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Sửa</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingAudioId(a.id)}
                        className="btn-comic btn-comic-red text-[11px] py-1 px-2"
                        title="Xóa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Pagination
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              totalItems={filteredAudios.length}
              pageSize={pageSize}
              onPageChange={(p) => {
                setCurrentPage(p);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        )}
      </div>

      {/* Edit Audio Modal */}
      <Modal
        isOpen={Boolean(editingAudio)}
        onClose={() => setEditingAudio(null)}
        title="SỬA THÔNG TIN AUDIO"
        confirmText="Lưu Thay Đổi"
        onConfirm={handleSaveEdit}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
              Tiêu đề truyện
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="input-comic text-xs py-1.5"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
              Tác giả
            </label>
            <input
              type="text"
              value={editAuthor}
              onChange={(e) => setEditAuthor(e.target.value)}
              className="input-comic text-xs py-1.5"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
              Thể loại
            </label>
            <select
              value={editCategoryId}
              onChange={(e) => setEditCategoryId(Number(e.target.value))}
              className="input-comic text-xs py-1.5 cursor-pointer font-bold"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
              Thẻ Tags{' '}
              <span className="text-[var(--ink-muted)] font-normal">(Phân cách bằng dấu phẩy)</span>
            </label>
            <input
              type="text"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder="tiên hiệp, tu tiên, audio..."
              className="input-comic text-xs py-1.5 font-bold"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
              Mô tả tóm tắt
            </label>
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="input-comic text-xs h-16 py-1.5 resize-none"
            />
          </div>

          <div className="flex flex-col gap-2 p-3 rounded-xl border-2 border-[var(--border-ink)] bg-[var(--surface-accent-soft)] mt-1">
            <div className="flex items-center gap-2">
              <input
                id="edit-audio-vip-box"
                type="checkbox"
                checked={editVip}
                onChange={(e) => setEditVip(e.target.checked)}
                className="w-4 h-4 rounded accent-[#8338EC] cursor-pointer"
              />
              <label
                htmlFor="edit-audio-vip-box"
                className="text-xs font-black text-[var(--ink-primary)] cursor-pointer flex items-center gap-1"
              >
                <Crown className="w-3.5 h-3.5 text-[#8338EC]" /> Độc quyền cho thành viên VIP
              </label>
            </div>

            {editVip && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-ink)]/20">
                <div className="flex flex-col">
                  <span className="text-[11px] font-extrabold text-[var(--ink-primary)]">
                    Số tập cho xem/nghe thử FREE:
                  </span>
                  <span className="text-[10px] font-medium text-[var(--ink-secondary)]">
                    Mặc định 1 tập. Nhập 0 để khóa toàn bộ, hoặc 2+ để mở thêm tập nghe thử.
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={editFreeEpisodesCount}
                  onChange={(e) =>
                    setEditFreeEpisodesCount(Math.max(0, parseInt(e.target.value, 10) || 0))
                  }
                  className="input-comic text-xs py-1 px-2 w-20 text-center font-black"
                />
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Delete Audio Modal */}
      <Modal
        isOpen={Boolean(deletingAudioId)}
        onClose={() => setDeletingAudioId(null)}
        title="XÓA AUDIO NÀY?"
        isDanger
        confirmText="Xóa Vĩnh Viễn"
        onConfirm={handleDeleteAudio}
        size="sm"
      >
        <div className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--ink-secondary)]">
          <p>Bạn có chắc chắn muốn xóa bộ audio này khỏi cơ sở dữ liệu?</p>
          <p className="text-[#E63946] font-bold">
            Toàn bộ các tập logic và tiến trình nghe liên quan cũng sẽ bị xóa!
          </p>
        </div>
      </Modal>
    </div>
  );
};
