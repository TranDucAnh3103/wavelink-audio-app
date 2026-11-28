'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Crown,
  Play,
  Scissors,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  Headphones,
  RefreshCw,
  Activity,
  BarChart3,
  Tag,
  FolderInput,
  User,
} from 'lucide-react';
import { api } from '@/services/api';
import { useUpdateAudio, useDeleteAudio } from '@/hooks/useAudio';
import { useCategories } from '@/hooks/useCategories';
import { useTags } from '@/hooks/useTags';
import { toast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { AdminTableSkeleton } from '@/components/common/Skeletons';
import { cn } from '@/lib/utils';
import { errMessage } from '@/lib/adminFormat';
import type { AdminAudio, BatchImportResponse, ImportStatsResponse, Paged } from '@/types/admin';
import type { AudioItem } from '@/types/audio';
import {
  AdminPage,
  EmptyBox,
  Field,
  FilterChips,
  PageTitle,
  SearchInput,
  SelectBar,
  Sheet,
  Spinner,
  useDebounced,
} from '@/components/admin/AdminUI';

const PAGE_SIZE = 12;

const FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'active', label: 'Đang hiện' },
  { key: 'hidden', label: 'Đã ẩn' },
  { key: 'vip', label: 'VIP' },
  { key: 'failed', label: 'Lỗi phát' },
  { key: 'user', label: 'User import' },
];

function filterParams(key: string): Record<string, string> {
  switch (key) {
    case 'active':
      return { status: 'ACTIVE' };
    case 'hidden':
      return { status: 'HIDDEN' };
    case 'vip':
      return { access: 'vip' };
    case 'failed':
      return { stream: 'FAILED' };
    case 'user':
      return { source: 'user' };
    default:
      return {};
  }
}

export const AdminAudiosPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: categories = [] } = useCategories(true);
  const { data: tags = [] } = useTags();
  const updateAudio = useUpdateAudio();
  const deleteAudio = useDeleteAudio();

  const urlFilter = searchParams.get('filter') || 'all';
  const [filter, setFilter] = useState(FILTERS.some((f) => f.key === urlFilter) ? urlFilter : 'all');
  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') || '');
  const [tagFilter, setTagFilter] = useState(searchParams.get('tag') || '');
  const [source, setSource] = useState(searchParams.get('source') || '');
  const [sort, setSort] = useState('newest');
  const [query, setQuery] = useState('');
  const q = useDebounced(query);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<Paged<AdminAudio> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<AdminAudio | null>(null);
  const [deleting, setDeleting] = useState<AdminAudio | null>(null);

  const [bulkCatOpen, setBulkCatOpen] = useState(false);
  const [bulkCatId, setBulkCatId] = useState<number>(0);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagName, setBulkTagName] = useState('');
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const [batchOpen, setBatchOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);

  useEffect(() => {
    const f = searchParams.get('filter');
    if (f && FILTERS.some((x) => x.key === f)) setFilter(f);
    const cid = searchParams.get('categoryId');
    if (cid !== null) setCategoryId(cid);
    const t = searchParams.get('tag');
    if (t !== null) setTagFilter(t);
    const s = searchParams.get('source');
    if (s !== null) setSource(s);
  }, [searchParams]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  useEffect(() => setPage(1), [filter, categoryId, tagFilter, source, sort, q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.admin
      .audios({
        ...filterParams(filter),
        categoryId,
        tag: tagFilter,
        source: filter === 'user' ? 'user' : source,
        sort,
        q,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && toast.error(errMessage(err, 'Không thể tải kho audio')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filter, categoryId, tagFilter, source, sort, q, page, reloadKey]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulk = async (
    ids: number[],
    action: 'hide' | 'show' | 'vip' | 'free' | 'delete' | 'set_category' | 'add_tag',
    extra?: { categoryId?: number; tag?: string }
  ) => {
    try {
      const res = await api.admin.bulkAudios({ ids, action, ...extra });
      toast.success(`Đã xử lý ${res.updated} audio`);
      setSelected(new Set());
      reload();
      return true;
    } catch (err) {
      toast.error(errMessage(err));
      return false;
    }
  };

  const batchProbeSelected = async (ids: number[]) => {
    try {
      toast.info('Đang kiểm tra luồng phát...');
      const res = await api.admin.checkStreamsBatch(ids);
      toast.success(`Đã kiểm tra ${res.checked} audio (${res.ok} tốt, ${res.failed} lỗi)`);
      setSelected(new Set());
      reload();
    } catch (err) {
      toast.error(errMessage(err));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return false;
    try {
      await deleteAudio.mutateAsync(deleting.id);
      toast.success('Đã xóa audio');
      reload();
      return true;
    } catch (err) {
      toast.error(errMessage(err, 'Không thể xóa audio'));
      return false;
    }
  };

  const items = data?.items || [];
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));

  return (
    <AdminPage active="audios">
      <PageTitle
        title="Kho audio"
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStatsOpen(true)}
              aria-label="Thống kê lượt import"
              className="btn-comic text-xs py-2 px-2.5 min-h-[40px]"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Lượt import</span>
            </button>
            <button
              type="button"
              onClick={() => setBatchOpen(true)}
              className="btn-comic btn-comic-yellow text-xs py-2 px-3 min-h-[40px]"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              <span>Import</span>
            </button>
          </div>
        }
      />

      <SearchInput value={query} onChange={setQuery} placeholder="Tìm theo tên, tác giả hoặc video ID" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            if (searchParams.has('categoryId')) {
              const next = new URLSearchParams(searchParams);
              next.delete('categoryId');
              setSearchParams(next, { replace: true });
            }
          }}
          aria-label="Thể loại"
          className="input-comic text-xs font-bold min-h-[42px] cursor-pointer"
        >
          <option value="">Mọi thể loại</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          aria-label="Thẻ"
          className="input-comic text-xs font-bold min-h-[42px] cursor-pointer"
        >
          <option value="">Mọi thẻ</option>
          {tags.map((t) => (
            <option key={t.id} value={t.slug}>
              #{t.name}
            </option>
          ))}
        </select>

        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label="Nguồn nhập"
          className="input-comic text-xs font-bold min-h-[42px] cursor-pointer"
        >
          <option value="">Mọi nguồn</option>
          <option value="admin">Admin đăng</option>
          <option value="user">User import</option>
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sắp xếp"
          className="input-comic text-xs font-bold min-h-[42px] cursor-pointer"
        >
          <option value="newest">Mới nhất</option>
          <option value="oldest">Cũ nhất</option>
          <option value="title">Tên A-Z</option>
        </select>
      </div>

      <FilterChips
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({ ...f, count: data?.counts[f.key] }))}
      />

      {loading && !data ? (
        <AdminTableSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyBox text="Không có audio phù hợp" />
      ) : (
        <>
          <div className={cn('grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3', loading && 'opacity-60')}>
            {items.map((a) => {
              const vip = Boolean(a.isVIPOnly || a.isVipOnly);
              const hidden = a.status === 'HIDDEN';
              return (
                <div
                  key={a.id}
                  className={cn(
                    'card-comic p-3 flex flex-col gap-2.5',
                    selected.has(a.id) && 'ring-2 ring-[#8338EC]',
                    hidden && 'opacity-80'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggle(a.id)}
                      aria-label={`Chọn ${a.title}`}
                      className="w-5 h-5 accent-[#8338EC] shrink-0 mt-1 cursor-pointer"
                    />
                    <img
                      src={a.thumbnailUrl || '/wavelink-icon.png'}
                      alt=""
                      loading="lazy"
                      className="w-16 h-16 rounded-xl border-2 border-[var(--border-ink)] object-cover shrink-0 bg-[#111113]"
                    />
                    <div className="flex flex-col min-w-0 flex-1 gap-1">
                      <h3 className="font-extrabold text-sm text-[var(--ink-primary)] leading-snug line-clamp-2">{a.title}</h3>
                      <span className="text-[11px] font-semibold text-[var(--ink-muted)] truncate">
                        {a.author || 'Chưa rõ tác giả'} · {a.categoryName || 'Chung'}
                      </span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {vip && (
                          <span className="badge-comic badge-comic-purple text-[10px] py-0 px-1.5 font-black">
                            <Crown className="w-2.5 h-2.5" /> VIP
                          </span>
                        )}
                        {hidden && <span className="badge-comic badge-comic-white text-[10px] py-0 px-1.5">Đã ẩn</span>}
                        {a.streamStatus === 'FAILED' && (
                          <span className="badge-comic badge-comic-red text-[10px] py-0 px-1.5">
                            <AlertTriangle className="w-2.5 h-2.5" /> Lỗi phát
                          </span>
                        )}
                        {a.tags?.slice(0, 2).map((t) => (
                          <span key={t} className="badge-comic badge-comic-yellow text-[9px] py-0 px-1">
                            #{t}
                          </span>
                        ))}
                      </div>
                      <span className="text-[11px] font-semibold text-[var(--ink-muted)] flex items-center gap-1.5 truncate">
                        {a.totalEpisodes} tập · {a.formattedDuration} · <Headphones className="w-3 h-3" /> {a.viewCount || 0}
                        {a.creatorUsername && (
                          <>
                            {' '}
                            · <User className="w-3 h-3" /> {a.creatorUsername}
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-[var(--border-ink)]/25">
                    <button type="button" onClick={() => navigate(`/player/${a.id}`)} className="btn-comic text-xs py-2 min-h-[40px] justify-center px-0" aria-label="Nghe thử">
                      <Play className="w-4 h-4 fill-current" />
                    </button>
                    <button type="button" onClick={() => navigate(`/admin/episodes?audioId=${a.id}`)} className="btn-comic text-xs py-2 min-h-[40px] justify-center px-0" aria-label="Quản lý tập">
                      <Scissors className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setEditing(a)} className="btn-comic text-xs py-2 min-h-[40px] justify-center px-0" aria-label="Sửa">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => bulk([a.id], hidden ? 'show' : 'hide')}
                      className="btn-comic text-xs py-2 min-h-[40px] justify-center px-0"
                      aria-label={hidden ? 'Hiện audio' : 'Ẩn audio'}
                    >
                      {hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button type="button" onClick={() => setDeleting(a)} className="btn-comic btn-comic-red text-xs py-2 min-h-[40px] justify-center px-0" aria-label="Xóa">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={data?.total}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => {
              setPage(p);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}

      {selected.size > 0 && (
        <SelectBar count={selected.size} onClear={() => setSelected(new Set())}>
          <button type="button" className="btn-comic text-xs py-1.5 px-3 min-h-[40px] shrink-0" onClick={() => bulk([...selected], 'show')}>
            <Eye className="w-4 h-4" /> Hiện
          </button>
          <button type="button" className="btn-comic text-xs py-1.5 px-3 min-h-[40px] shrink-0" onClick={() => bulk([...selected], 'hide')}>
            <EyeOff className="w-4 h-4" /> Ẩn
          </button>
          <button type="button" className="btn-comic btn-comic-purple text-xs py-1.5 px-3 min-h-[40px] shrink-0" onClick={() => bulk([...selected], 'vip')}>
            <Crown className="w-4 h-4" /> VIP
          </button>
          <button type="button" className="btn-comic text-xs py-1.5 px-3 min-h-[40px] shrink-0" onClick={() => bulk([...selected], 'free')}>
            Miễn phí
          </button>
          <button
            type="button"
            className="btn-comic text-xs py-1.5 px-3 min-h-[40px] shrink-0"
            onClick={() => {
              setBulkCatId(categories[0]?.id || 0);
              setBulkCatOpen(true);
            }}
          >
            <FolderInput className="w-4 h-4" /> Đổi thể loại
          </button>
          <button
            type="button"
            className="btn-comic text-xs py-1.5 px-3 min-h-[40px] shrink-0"
            onClick={() => {
              setBulkTagName('');
              setBulkTagOpen(true);
            }}
          >
            <Tag className="w-4 h-4" /> Gắn thẻ
          </button>
          <button
            type="button"
            className="btn-comic text-xs py-1.5 px-3 min-h-[40px] shrink-0"
            onClick={() => batchProbeSelected([...selected])}
          >
            <Activity className="w-4 h-4" /> Kiểm tra luồng
          </button>
          <button type="button" className="btn-comic btn-comic-red text-xs py-1.5 px-3 min-h-[40px] shrink-0" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="w-4 h-4" /> Xóa
          </button>
        </SelectBar>
      )}

      <EditAudioSheet
        audio={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onReload={reload}
        onSave={async (id, payload) => {
          try {
            await updateAudio.mutateAsync({ id, data: payload });
            toast.success('Đã lưu thay đổi');
            setEditing(null);
            reload();
          } catch (err) {
            toast.error(errMessage(err, 'Không thể lưu audio'));
          }
        }}
      />

      <BatchImportSheet
        isOpen={batchOpen}
        categories={categories}
        onClose={() => setBatchOpen(false)}
        onDone={reload}
      />

      <ImportStatsSheet isOpen={statsOpen} onClose={() => setStatsOpen(false)} />

      <Modal
        isOpen={bulkCatOpen}
        onClose={() => setBulkCatOpen(false)}
        title="Chuyển thể loại hàng loạt"
        confirmText="Áp dụng"
        size="sm"
        onConfirm={() => bulk([...selected], 'set_category', { categoryId: bulkCatId })}
      >
        <Field label="Thể loại đích">
          <select
            value={bulkCatId}
            onChange={(e) => setBulkCatId(Number(e.target.value))}
            className="input-comic text-sm font-bold cursor-pointer"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </Modal>

      <Modal
        isOpen={bulkTagOpen}
        onClose={() => setBulkTagOpen(false)}
        title="Gắn thẻ hàng loạt"
        confirmText="Gắn thẻ"
        size="sm"
        onConfirm={() => bulk([...selected], 'add_tag', { tag: bulkTagName })}
      >
        <Field label="Tên thẻ">
          <input value={bulkTagName} onChange={(e) => setBulkTagName(e.target.value)} placeholder="vd: tiên hiệp" className="input-comic text-sm" />
        </Field>
      </Modal>

      <Modal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title="Xóa audio đã chọn"
        confirmText="Xóa vĩnh viễn"
        isDanger
        size="sm"
        onConfirm={() => bulk([...selected], 'delete')}
      >
        <p className="text-sm font-semibold">
          Xóa {selected.size} audio? Toàn bộ tập, tiến độ và lịch sử nghe liên quan sẽ bị xóa.
        </p>
      </Modal>

      <Modal
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Xóa audio"
        confirmText="Xóa vĩnh viễn"
        isDanger
        size="sm"
        onConfirm={confirmDelete}
      >
        <p className="text-sm font-semibold">
          Xóa “{deleting?.title}”? Toàn bộ tập, tiến độ nghe, lịch sử và yêu thích liên quan sẽ bị xóa.
        </p>
      </Modal>
    </AdminPage>
  );
};

const EditAudioSheet: React.FC<{
  audio: AdminAudio | null;
  categories: { id: number; name: string }[];
  onClose: () => void;
  onReload: () => void;
  onSave: (id: number, payload: Partial<AudioItem>) => Promise<void>;
}> = ({ audio, categories, onClose, onReload, onSave }) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [desc, setDesc] = useState('');
  const [categoryId, setCategoryId] = useState(0);
  const [tags, setTags] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [durationSec, setDurationSec] = useState(0);
  const [vip, setVip] = useState(false);
  const [free, setFree] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!audio) return;
    setTitle(audio.title);
    setAuthor(audio.author || '');
    setDesc(audio.description || '');
    setCategoryId(audio.categoryId || categories[0]?.id || 0);
    setTags((audio.tags || []).join(', '));
    setYoutubeUrl(audio.youtubeUrl || '');
    setThumbnailUrl(audio.thumbnailUrl || '');
    setDurationSec(audio.totalDurationSeconds || 0);
    setVip(Boolean(audio.isVIPOnly || audio.isVipOnly));
    setFree(audio.freeEpisodesCount ?? 1);
    setHidden(audio.status === 'HIDDEN');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio]);

  const submit = async () => {
    if (!audio) return;
    if (!title.trim()) {
      toast.error('Tiêu đề không được để trống');
      return;
    }
    setBusy(true);
    try {
      await onSave(audio.id, {
        title: title.trim(),
        author: author.trim(),
        description: desc.trim(),
        categoryId,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        youtubeUrl: youtubeUrl.trim() !== (audio.youtubeUrl || '') ? youtubeUrl.trim() : undefined,
        thumbnailUrl: thumbnailUrl.trim(),
        totalDurationSeconds: durationSec > 0 ? durationSec : undefined,
        isVIPOnly: vip,
        isVipOnly: vip,
        freeEpisodesCount: vip ? Math.max(0, free) : 1,
        status: hidden ? 'HIDDEN' : 'ACTIVE',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      isOpen={Boolean(audio)}
      onClose={onClose}
      title="Sửa audio"
      footer={
        <button type="button" disabled={busy} onClick={submit} className="btn-comic btn-comic-primary w-full justify-center text-sm py-2.5 min-h-[44px]">
          {busy ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      }
    >
      <Field label="Tiêu đề">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-comic text-sm" />
      </Field>
      <Field label="Tác giả">
        <input value={author} onChange={(e) => setAuthor(e.target.value)} className="input-comic text-sm" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <Field label="Thể loại">
          <select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))} className="input-comic text-sm font-bold cursor-pointer">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Thời lượng (giây)">
          <input type="number" min={0} value={durationSec} onChange={(e) => setDurationSec(Math.max(0, Number(e.target.value) || 0))} className="input-comic text-sm font-mono" />
        </Field>
      </div>
      <Field label="Thẻ (phân cách bằng dấu phẩy)">
        <input value={tags} onChange={(e) => setTags(e.target.value)} className="input-comic text-sm" />
      </Field>
      <Field label="Nguồn YouTube (link hoặc ID)">
        <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} className="input-comic text-sm font-mono" />
      </Field>
      <Field label="Ảnh bìa (URL)">
        <input value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} className="input-comic text-sm font-mono" />
      </Field>
      <Field label="Mô tả">
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="input-comic text-sm resize-none" />
      </Field>

      <label className="flex items-center justify-between gap-3 card-comic-sm p-3 cursor-pointer">
        <span className="text-sm font-extrabold flex items-center gap-1.5 text-[var(--ink-primary)]">
          <Crown className="w-4 h-4 text-[#8338EC]" /> Chỉ dành cho VIP
        </span>
        <input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} className="w-5 h-5 accent-[#8338EC]" />
      </label>
      {vip && (
        <Field label="Số tập nghe thử miễn phí">
          <input
            type="number"
            min={0}
            max={1000}
            value={free}
            onChange={(e) => setFree(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="input-comic text-sm font-mono"
          />
        </Field>
      )}
      <label className="flex items-center justify-between gap-3 card-comic-sm p-3 cursor-pointer">
        <span className="text-sm font-extrabold flex items-center gap-1.5 text-[var(--ink-primary)]">
          <EyeOff className="w-4 h-4" /> Ẩn khỏi người dùng
        </span>
        <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="w-5 h-5 accent-[#8338EC]" />
      </label>

      {audio && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-ink)]/25">
          <button
            type="button"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              try {
                const res = await api.audio.checkStream(audio.id);
                if (res.streamStatus === 'OK') toast.success('Luồng phát ổn định');
                else toast.error(res.error || 'Luồng phát gặp lỗi');
                onReload();
              } catch (err) {
                toast.error(errMessage(err));
              } finally {
                setChecking(false);
              }
            }}
            className="btn-comic text-xs py-2 min-h-[42px] justify-center"
          >
            <Activity className={cn('w-4 h-4', checking && 'animate-pulse')} />
            <span>{checking ? 'Đang kiểm tra...' : 'Kiểm tra luồng'}</span>
          </button>
          <button
            type="button"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              try {
                const updated = await api.audio.refreshAudio(audio.id);
                if (updated) {
                  setTitle(updated.title || title);
                  setAuthor(updated.author || author);
                  setThumbnailUrl(updated.thumbnailUrl || thumbnailUrl);
                  toast.success('Đã đồng bộ từ YouTube');
                  onReload();
                } else {
                  toast.error('Không thể đồng bộ từ YouTube');
                }
              } catch (err) {
                toast.error(errMessage(err));
              } finally {
                setRefreshing(false);
              }
            }}
            className="btn-comic text-xs py-2 min-h-[42px] justify-center"
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            <span>{refreshing ? 'Đang tải...' : 'Đồng bộ YouTube'}</span>
          </button>
        </div>
      )}
    </Sheet>
  );
};

const BatchImportSheet: React.FC<{
  isOpen: boolean;
  categories: { id: number; name: string }[];
  onClose: () => void;
  onDone: () => void;
}> = ({ isOpen, categories, onClose, onDone }) => {
  const [rawUrls, setRawUrls] = useState('');
  const [categoryId, setCategoryId] = useState(0);
  const [tags, setTags] = useState('');
  const [blockSize, setBlockSize] = useState(14400);
  const [vip, setVip] = useState(false);
  const [free, setFree] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BatchImportResponse | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCategoryId(categories[0]?.id || 0);
      setResult(null);
    }
  }, [isOpen, categories]);

  const submit = async () => {
    const urls = rawUrls.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (urls.length === 0) {
      toast.error('Vui lòng dán ít nhất 1 link YouTube');
      return;
    }
    setBusy(true);
    try {
      const res = await api.admin.importBatch({
        urls,
        categoryId,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        blockSizeSeconds: blockSize,
        isVipOnly: vip,
        freeEpisodesCount: free,
      });
      setResult(res);
      toast.success(`Đã nhập ${res.created} mới, ${res.duplicate} trùng, ${res.failed} lỗi`);
      if (res.created > 0) onDone();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Import YouTube"
      footer={
        <button type="button" disabled={busy} onClick={submit} className="btn-comic btn-comic-primary w-full justify-center text-sm py-2.5 min-h-[44px]">
          {busy ? 'Đang xử lý...' : 'Bắt đầu import'}
        </button>
      }
    >
      <Field label="Danh sách link YouTube (mỗi dòng 1 link)">
        <textarea
          rows={4}
          value={rawUrls}
          onChange={(e) => setRawUrls(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="input-comic text-sm font-mono resize-none"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Thể loại">
          <select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))} className="input-comic text-sm font-bold cursor-pointer">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Chia tập">
          <select value={blockSize} onChange={(e) => setBlockSize(Number(e.target.value))} className="input-comic text-sm font-bold cursor-pointer">
            <option value={14400}>4 tiếng / tập</option>
            <option value={7200}>2 tiếng / tập</option>
            <option value={3600}>1 tiếng / tập</option>
            <option value={1800}>30 phút / tập</option>
          </select>
        </Field>
      </div>
      <Field label="Thẻ (phân cách bằng dấu phẩy)">
        <input value={tags} onChange={(e) => setTags(e.target.value)} className="input-comic text-sm" />
      </Field>
      <label className="flex items-center justify-between gap-3 card-comic-sm p-3 cursor-pointer">
        <span className="text-sm font-extrabold flex items-center gap-1.5">
          <Crown className="w-4 h-4 text-[#8338EC]" /> Chỉ dành cho VIP
        </span>
        <input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} className="w-5 h-5 accent-[#8338EC]" />
      </label>
      {vip && (
        <Field label="Số tập nghe thử miễn phí">
          <input type="number" min={0} max={1000} value={free} onChange={(e) => setFree(Math.max(0, Number(e.target.value) || 0))} className="input-comic text-sm font-mono" />
        </Field>
      )}
      {result && (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border-ink)]/25">
          {result.results.map((r, idx) => (
            <div key={idx} className="text-xs font-semibold flex items-center justify-between gap-2">
              <span className="truncate">{r.title || r.url}</span>
              <span className={cn('badge-comic text-[10px] py-0 px-1.5 shrink-0', r.status === 'created' ? 'badge-comic-teal' : r.status === 'duplicate' ? 'badge-comic-yellow' : 'badge-comic-red')}>
                {r.status === 'created' ? 'Mới' : r.status === 'duplicate' ? 'Trùng' : 'Lỗi'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
};

const ImportStatsSheet: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [stats, setStats] = useState<ImportStatsResponse | null>(null);

  useEffect(() => {
    if (isOpen) {
      api.admin.importStats().then(setStats).catch((err) => toast.error(errMessage(err)));
    }
  }, [isOpen]);

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Thống kê người import">
      {!stats ? (
        <Spinner />
      ) : (
        <>
          <div className="text-xs font-bold text-[var(--ink-secondary)]">
            Hạn mức tài khoản thường: {stats.dailyLimit} lượt/ngày · {stats.allowUserImport ? 'Đang mở' : 'Đang tắt'}
          </div>
          {stats.items.length === 0 ? (
            <EmptyBox text="Chưa có dữ liệu import" />
          ) : (
            <div className="flex flex-col gap-2">
              {stats.items.map((u) => (
                <div key={u.userId} className="card-comic-sm p-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-extrabold text-[var(--ink-primary)] truncate">{u.username}</span>
                    <span className="badge-comic badge-comic-white text-[10px] py-0 px-1">{u.role || 'USER'}</span>
                  </div>
                  <span className="font-mono font-bold text-[var(--ink-secondary)] shrink-0">
                    Hôm nay: {u.today} · Tổng: {u.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
};
