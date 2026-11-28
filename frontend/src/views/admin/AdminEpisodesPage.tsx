'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Scissors, Crown, Plus, Pencil, Trash2, Play, ListOrdered, Search } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAudios } from '@/hooks/useAudio';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { api } from '@/services/api';
import { cn, formatTime } from '@/lib/utils';
import { errMessage } from '@/lib/adminFormat';
import { AdminTableSkeleton } from '@/components/common/Skeletons';
import { Pagination } from '@/components/ui/Pagination';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';
import type { AdminEpisodeRow } from '@/types/admin';
import {
  AdminPage,
  EmptyBox,
  Field,
  PageTitle,
  SearchInput,
  SelectBar,
  Sheet,
} from '@/components/admin/AdminUI';

export const AdminEpisodesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const urlAudioId = searchParams.get('audioId') ? Number(searchParams.get('audioId')) : null;
  const { data: audios = [], isLoading: audiosLoading } = useAudios({ fields: 'catalog', all: true });
  const [selectedAudioId, setSelectedAudioId] = useState<number | null>(urlAudioId);

  useEffect(() => {
    if (urlAudioId) {
      setSelectedAudioId(urlAudioId);
    } else if (audios.length > 0 && !selectedAudioId) {
      setSelectedAudioId(audios[0].id);
    }
  }, [audios, selectedAudioId, urlAudioId]);

  const activeId = selectedAudioId || audios[0]?.id || 0;
  const selectedAudio = audios.find((a) => a.id === activeId) || audios[0];

  const [episodes, setEpisodes] = useState<AdminEpisodeRow[]>([]);
  const [loadedAudioDuration, setLoadedAudioDuration] = useState(0);
  const [epLoading, setEpLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setEpLoading(true);
    api.admin
      .audioEpisodes(activeId)
      .then((res) => {
        if (cancelled) return;
        setEpisodes(res.items);
        setLoadedAudioDuration(res.audio?.totalDurationSeconds || 0);
      })
      .catch((err) => !cancelled && toast.error(errMessage(err, 'Không thể tải danh sách tập')))
      .finally(() => !cancelled && setEpLoading(false));
    return () => {
      cancelled = true;
    };
  }, [activeId, reloadKey]);

  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [activeId]);

  const pageSize = DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(episodes.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = episodes.slice((safePage - 1) * pageSize, safePage * pageSize);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const filteredAudios = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return audios.slice(0, 60);
    return audios
      .filter((a) => a.title.toLowerCase().includes(q) || a.author?.toLowerCase().includes(q))
      .slice(0, 60);
  }, [audios, pickerQuery]);

  const [blockSize, setBlockSize] = useState(14400);
  const [rechunking, setRechunking] = useState(false);

  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [chaptersText, setChaptersText] = useState('');
  const [applyingChapters, setApplyingChapters] = useState(false);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  useEffect(() => setSelected(new Set()), [activeId]);

  const [sheet, setSheet] = useState<{ mode: 'add' } | { mode: 'edit'; ep: AdminEpisodeRow } | null>(null);
  const [epTitle, setEpTitle] = useState('');
  const [epNum, setEpNum] = useState(1);
  const [epStart, setEpStart] = useState(0);
  const [epEnd, setEpEnd] = useState(14400);
  const [epVip, setEpVip] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AdminEpisodeRow | null>(null);

  const [prefixOpen, setPrefixOpen] = useState(false);
  const [prefixText, setPrefixText] = useState('Tập');
  const [bulkDelOpen, setBulkDelOpen] = useState(false);

  const selectAudio = (id: number) => {
    setSelectedAudioId(id);
    setSearchParams({ audioId: String(id) });
    setPickerOpen(false);
  };

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rechunk = async () => {
    if (!selectedAudio) return;
    setRechunking(true);
    try {
      await api.episode.generateEpisodes(
        selectedAudio.id,
        blockSize,
        selectedAudio.totalDurationSeconds || loadedAudioDuration || 0
      );
      queryClient.invalidateQueries({ queryKey: ['episodes', selectedAudio.id] });
      queryClient.invalidateQueries({ queryKey: ['audios'] });
      toast.success('Đã chia lại tập');
      reload();
    } catch (err) {
      toast.error(errMessage(err, 'Không thể chia lại tập'));
    } finally {
      setRechunking(false);
    }
  };

  const applyChapters = async () => {
    if (!selectedAudio) return;
    setApplyingChapters(true);
    try {
      await api.admin.batchChapters(selectedAudio.id, chaptersText);
      queryClient.invalidateQueries({ queryKey: ['episodes', selectedAudio.id] });
      queryClient.invalidateQueries({ queryKey: ['audios'] });
      toast.success('Đã tạo tập theo mốc thời gian');
      setChaptersOpen(false);
      setChaptersText('');
      reload();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setApplyingChapters(false);
    }
  };

  const bulkAction = async (
    action: 'vip' | 'free' | 'delete' | 'renumber' | 'rename_prefix',
    prefix?: string
  ) => {
    if (!selectedAudio) return false;
    try {
      await api.admin.bulkEpisodes({
        audioId: selectedAudio.id,
        ids: [...selected],
        action,
        prefix,
      });
      queryClient.invalidateQueries({ queryKey: ['episodes', selectedAudio.id] });
      queryClient.invalidateQueries({ queryKey: ['audios'] });
      toast.success('Đã cập nhật danh sách tập');
      setSelected(new Set());
      reload();
      return true;
    } catch (err) {
      toast.error(errMessage(err));
      return false;
    }
  };

  const openAdd = () => {
    const last = episodes[episodes.length - 1];
    const start = last ? last.endSeconds : 0;
    const isAudioVip = Boolean(selectedAudio?.isVIPOnly || selectedAudio?.isVipOnly);
    const freeLimit = selectedAudio?.freeEpisodesCount ?? 1;
    const nextNum = episodes.length + 1;
    setEpNum(nextNum);
    setEpTitle(`Tập ${nextNum}`);
    setEpStart(start);
    setEpEnd(start + 14400);
    setEpVip(isAudioVip && (freeLimit === 0 || nextNum > freeLimit));
    setSheet({ mode: 'add' });
  };

  const openEdit = (ep: AdminEpisodeRow) => {
    setEpNum(ep.episodeNumber);
    setEpTitle(ep.title);
    setEpStart(ep.startSeconds);
    setEpEnd(ep.endSeconds);
    setEpVip(Boolean(ep.isVip));
    setSheet({ mode: 'edit', ep });
  };

  const saveEpisode = async () => {
    if (!selectedAudio || !sheet) return;
    if (!epTitle.trim() || epEnd <= epStart) {
      toast.error('Thời điểm kết thúc phải lớn hơn bắt đầu');
      return;
    }
    setSaving(true);
    try {
      if (sheet.mode === 'add') {
        await api.episode.createEpisode({
          audioId: selectedAudio.id,
          episodeNumber: epNum,
          title: epTitle.trim(),
          startSeconds: epStart,
          endSeconds: epEnd,
          duration: epEnd - epStart,
          isVip: epVip,
        });
        toast.success('Đã thêm tập');
      } else {
        await api.episode.updateEpisode(sheet.ep.id, {
          episodeNumber: epNum,
          title: epTitle.trim(),
          startSeconds: epStart,
          endSeconds: epEnd,
          duration: epEnd - epStart,
          isVip: epVip,
        });
        toast.success('Đã cập nhật tập');
      }
      queryClient.invalidateQueries({ queryKey: ['episodes', selectedAudio.id] });
      queryClient.invalidateQueries({ queryKey: ['audios'] });
      setSheet(null);
      reload();
    } catch (err) {
      toast.error(errMessage(err, 'Không thể lưu tập'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || !selectedAudio) return false;
    try {
      await api.episode.deleteEpisode(deleting.id);
      queryClient.invalidateQueries({ queryKey: ['episodes', selectedAudio.id] });
      queryClient.invalidateQueries({ queryKey: ['audios'] });
      toast.success('Đã xóa và đánh số lại tập');
      reload();
      return true;
    } catch (err) {
      toast.error(errMessage(err, 'Không thể xóa tập'));
      return false;
    }
  };

  return (
    <AdminPage active="episodes">
      <PageTitle
        title="Phân tập"
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => bulkAction('renumber')}
              disabled={!selectedAudio || episodes.length === 0}
              aria-label="Đánh số lại từ 1"
              className="btn-comic text-xs py-2 px-2.5 min-h-[40px]"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setChaptersOpen(true)}
              disabled={!selectedAudio}
              className="btn-comic text-xs py-2 px-3 min-h-[40px]"
            >
              Mốc chương
            </button>
            <button
              type="button"
              onClick={openAdd}
              disabled={!selectedAudio}
              className="btn-comic btn-comic-yellow text-xs py-2 px-3 min-h-[40px]"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              <span>Thêm</span>
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card-comic p-3.5 flex flex-col gap-2">
          <Field label="Bộ audio">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="input-comic text-sm font-bold min-h-[44px] flex items-center justify-between gap-2 text-left cursor-pointer"
            >
              <span className="truncate">
                {selectedAudio ? `${selectedAudio.title} (${episodes.length} tập)` : 'Chọn bộ audio'}
              </span>
              <Search className="w-4 h-4 text-[var(--ink-muted)] shrink-0" />
            </button>
          </Field>
        </div>

        <div className="card-comic p-3.5 flex flex-col gap-2">
          <Field label="Chia lại tự động">
            <div className="flex items-center gap-2">
              <select
                value={blockSize}
                onChange={(e) => setBlockSize(Number(e.target.value))}
                className="input-comic text-sm font-bold flex-1 min-w-0 min-h-[44px] cursor-pointer"
              >
                <option value={14400}>4 tiếng / tập</option>
                <option value={7200}>2 tiếng / tập</option>
                <option value={3600}>1 tiếng / tập</option>
                <option value={1800}>30 phút / tập</option>
              </select>
              <button
                type="button"
                onClick={rechunk}
                disabled={rechunking || !selectedAudio}
                className="btn-comic btn-comic-primary text-xs px-3.5 min-h-[44px] shrink-0"
              >
                <Scissors className={`w-4 h-4 ${rechunking ? 'animate-spin' : ''}`} />
                <span>Chia lại</span>
              </button>
            </div>
          </Field>
        </div>
      </div>

      {(epLoading || audiosLoading) && episodes.length === 0 ? (
        <AdminTableSkeleton rows={4} />
      ) : episodes.length === 0 ? (
        <EmptyBox text="Bộ audio này chưa có tập nào" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {paged.map((ep) => (
              <div
                key={ep.id}
                className={cn(
                  'card-comic-sm p-3 bg-[var(--surface-card)] flex items-center justify-between gap-2.5',
                  selected.has(ep.id) && 'ring-2 ring-[#8338EC]'
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={selected.has(ep.id)}
                    onChange={() => toggle(ep.id)}
                    aria-label={`Chọn ${ep.title}`}
                    className="w-5 h-5 accent-[#8338EC] shrink-0 cursor-pointer"
                  />
                  <div className="w-9 h-9 rounded-lg border-2 border-[#111113] bg-[#FFE600] flex items-center justify-center font-black text-xs text-[#111113] shrink-0">
                    T{ep.episodeNumber}
                  </div>
                  <div className="flex flex-col min-w-0 gap-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-sm text-[var(--ink-primary)] truncate">
                        {ep.title}
                      </span>
                      {ep.isVip && (
                        <span className="badge-comic badge-comic-purple text-[10px] py-0 px-1.5 font-black shrink-0">
                          <Crown className="w-2.5 h-2.5" /> VIP
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-[var(--ink-muted)] truncate">
                      {formatTime(ep.startSeconds)} → {formatTime(ep.endSeconds)}
                      {(ep.inProgressCount > 0 || ep.completedCount > 0) &&
                        ` · ${ep.inProgressCount} nghe · ${ep.completedCount} xong`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/player/${activeId}?t=${ep.startSeconds}`)}
                    aria-label={`Nghe ${ep.title}`}
                    className="btn-comic text-xs py-2 px-2.5 min-h-[40px]"
                  >
                    <Play className="w-4 h-4 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(ep)}
                    aria-label={`Sửa ${ep.title}`}
                    className="btn-comic text-xs py-2 px-2.5 min-h-[40px]"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(ep)}
                    aria-label={`Xóa ${ep.title}`}
                    className="btn-comic btn-comic-red text-xs py-2 px-2.5 min-h-[40px]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={episodes.length}
            pageSize={pageSize}
            onPageChange={(p) => {
              setPage(p);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}

      {selected.size > 0 && (
        <SelectBar count={selected.size} onClear={() => setSelected(new Set())}>
          <button type="button" className="btn-comic btn-comic-purple text-xs py-1.5 px-3 min-h-[40px] shrink-0" onClick={() => bulkAction('vip')}>
            <Crown className="w-4 h-4" /> Đặt VIP
          </button>
          <button type="button" className="btn-comic text-xs py-1.5 px-3 min-h-[40px] shrink-0" onClick={() => bulkAction('free')}>
            Miễn phí
          </button>
          <button type="button" className="btn-comic text-xs py-1.5 px-3 min-h-[40px] shrink-0" onClick={() => setPrefixOpen(true)}>
            Đổi tên
          </button>
          <button type="button" className="btn-comic btn-comic-red text-xs py-1.5 px-3 min-h-[40px] shrink-0" onClick={() => setBulkDelOpen(true)}>
            <Trash2 className="w-4 h-4" /> Xóa
          </button>
        </SelectBar>
      )}

      <Sheet isOpen={pickerOpen} onClose={() => setPickerOpen(false)} title="Chọn bộ audio">
        <SearchInput value={pickerQuery} onChange={setPickerQuery} placeholder="Tìm theo tên hoặc tác giả" />
        <div className="flex flex-col gap-1.5">
          {filteredAudios.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => selectAudio(a.id)}
              className={cn(
                'card-comic-sm p-2.5 flex items-center justify-between gap-2 text-left cursor-pointer',
                a.id === activeId && 'bg-[#FFE600] text-[#111113]'
              )}
            >
              <span className="font-extrabold text-xs truncate">{a.title}</span>
              <span className="text-[11px] font-mono shrink-0">{a.totalEpisodes} tập</span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet
        isOpen={chaptersOpen}
        onClose={() => setChaptersOpen(false)}
        title="Chia tập theo mốc thời gian"
        footer={
          <button
            type="button"
            disabled={applyingChapters || !chaptersText.trim()}
            onClick={applyChapters}
            className="btn-comic btn-comic-primary w-full justify-center text-sm py-2.5 min-h-[44px]"
          >
            {applyingChapters ? 'Đang áp dụng...' : 'Áp dụng mốc tập'}
          </button>
        }
      >
        <Field label="Dán danh sách mốc (mỗi dòng 1 chương)">
          <textarea
            rows={8}
            value={chaptersText}
            onChange={(e) => setChaptersText(e.target.value)}
            placeholder={'00:00 Mở đầu\n15:30 Chương 1\n01:02:10 Chương 2'}
            className="input-comic text-sm font-mono resize-none"
          />
        </Field>
      </Sheet>

      <Sheet
        isOpen={Boolean(sheet)}
        onClose={() => setSheet(null)}
        title={sheet?.mode === 'edit' ? 'Sửa tập' : 'Thêm tập'}
        footer={
          <button
            type="button"
            disabled={saving || !epTitle.trim() || epEnd <= epStart}
            onClick={saveEpisode}
            className="btn-comic btn-comic-primary w-full justify-center text-sm py-2.5 min-h-[44px]"
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        }
      >
        <div className="grid grid-cols-4 gap-2.5">
          <Field label="Thứ tự">
            <input
              type="number"
              min={1}
              value={epNum}
              onChange={(e) => setEpNum(Math.max(1, Number(e.target.value) || 1))}
              className="input-comic text-sm font-mono min-h-[44px]"
            />
          </Field>
          <div className="col-span-3">
            <Field label="Tiêu đề tập">
              <input
                type="text"
                value={epTitle}
                onChange={(e) => setEpTitle(e.target.value)}
                className="input-comic text-sm min-h-[44px]"
              />
            </Field>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Bắt đầu (giây)">
            <input
              type="number"
              min={0}
              value={epStart}
              onChange={(e) => setEpStart(Math.max(0, Number(e.target.value) || 0))}
              className="input-comic text-sm font-mono min-h-[44px]"
            />
          </Field>
          <Field label="Kết thúc (giây)">
            <input
              type="number"
              min={1}
              value={epEnd}
              onChange={(e) => setEpEnd(Math.max(0, Number(e.target.value) || 0))}
              className="input-comic text-sm font-mono min-h-[44px]"
            />
          </Field>
        </div>
        <span className="text-xs font-mono font-bold text-[var(--ink-secondary)]">
          {formatTime(epStart)} → {formatTime(epEnd)}
        </span>
        <label className="flex items-center justify-between gap-3 card-comic-sm p-3 cursor-pointer">
          <span className="text-sm font-extrabold flex items-center gap-1.5 text-[var(--ink-primary)]">
            <Crown className="w-4 h-4 text-[#8338EC]" /> Tập VIP
          </span>
          <input type="checkbox" checked={epVip} onChange={(e) => setEpVip(e.target.checked)} className="w-5 h-5 accent-[#8338EC]" />
        </label>
      </Sheet>

      <Modal
        isOpen={prefixOpen}
        onClose={() => setPrefixOpen(false)}
        title="Đổi tên tập hàng loạt"
        confirmText="Áp dụng"
        size="sm"
        onConfirm={() => bulkAction('rename_prefix', prefixText)}
      >
        <Field label="Tiền tố (kèm số thứ tự tập)">
          <input value={prefixText} onChange={(e) => setPrefixText(e.target.value)} className="input-comic text-sm" />
        </Field>
      </Modal>

      <Modal
        isOpen={bulkDelOpen}
        onClose={() => setBulkDelOpen(false)}
        title="Xóa tập đã chọn"
        confirmText="Xóa"
        isDanger
        size="sm"
        onConfirm={() => bulkAction('delete')}
      >
        <p className="text-sm font-semibold">Xóa {selected.size} tập và đánh số lại các tập còn lại?</p>
      </Modal>

      <Modal
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Xóa tập"
        isDanger
        confirmText="Xóa"
        onConfirm={confirmDelete}
        size="sm"
      >
        <p className="text-sm font-semibold">Xóa “{deleting?.title}”?</p>
      </Modal>
    </AdminPage>
  );
};
