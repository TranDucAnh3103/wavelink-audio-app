'use client';

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Plus, Trash2, X, Merge, ExternalLink, Sparkles } from 'lucide-react';
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useMergeCategories,
} from '@/hooks/useCategories';
import {
  useTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  useMergeTags,
  useCleanupUnusedTags,
} from '@/hooks/useTags';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { Category, Tag } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';
import { AdminTableSkeleton } from '@/components/common/Skeletons';
import { cn } from '@/lib/utils';
import { errMessage } from '@/lib/adminFormat';
import {
  AdminPage,
  EmptyBox,
  Field,
  PageTitle,
  SearchInput,
  Sheet,
} from '@/components/admin/AdminUI';

const COLORS = [
  { key: 'primary', hex: '#FFE600' },
  { key: 'blue', hex: '#3A86FF' },
  { key: 'teal', hex: '#2A9D8F' },
  { key: 'purple', hex: '#8338EC' },
  { key: 'orange', hex: '#F4A261' },
  { key: 'red', hex: '#E63946' },
];

function toSlug(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const AdminCategoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: categories = [], isLoading: catLoading } = useCategories(true);
  const createCat = useCreateCategory();
  const updateCat = useUpdateCategory();
  const deleteCat = useDeleteCategory();
  const mergeCats = useMergeCategories();

  const { data: tags = [] } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const mergeTags = useMergeTags();
  const cleanupTags = useCleanupUnusedTags();

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const [catSheet, setCatSheet] = useState<{ mode: 'add' } | { mode: 'edit'; cat: Category } | null>(null);
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catColor, setCatColor] = useState('primary');
  const [deletingCat, setDeletingCat] = useState<Category | null>(null);

  const [mergeCatOpen, setMergeCatOpen] = useState(false);
  const [srcCatId, setSrcCatId] = useState(0);
  const [dstCatId, setDstCatId] = useState(0);

  const [newTag, setNewTag] = useState('');
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [tagName, setTagName] = useState('');
  const [tagSlug, setTagSlug] = useState('');

  const [mergeTagOpen, setMergeTagOpen] = useState(false);
  const [mergeTagSrc, setMergeTagSrc] = useState<Set<number>>(new Set());
  const [mergeTagDst, setMergeTagDst] = useState(0);

  const q = query.trim().toLowerCase();
  const filteredCats = q
    ? categories.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q))
    : categories;
  const filteredTags = q
    ? tags.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q))
    : tags;

  useEffect(() => setPage(1), [q]);

  const pageSize = DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filteredCats.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const showSkeleton = useDelayedFallback(catLoading && categories.length === 0, 180);

  const openAddCat = () => {
    setCatName('');
    setCatSlug('');
    setCatDesc('');
    setCatColor('primary');
    setCatSheet({ mode: 'add' });
  };

  const openEditCat = (cat: Category) => {
    setCatName(cat.name);
    setCatSlug(cat.slug);
    setCatDesc(cat.description || '');
    setCatColor(cat.color || 'primary');
    setCatSheet({ mode: 'edit', cat });
  };

  const saveCategory = async () => {
    const name = catName.trim();
    const slug = (catSlug.trim() || toSlug(name)).trim();
    if (!name || !slug) {
      toast.error('Tên thể loại không được để trống');
      return;
    }
    try {
      if (catSheet?.mode === 'edit') {
        await updateCat.mutateAsync({
          id: catSheet.cat.id,
          data: { name, slug, description: catDesc.trim(), color: catColor },
        });
        toast.success('Đã cập nhật thể loại');
      } else {
        await createCat.mutateAsync({ name, slug, description: catDesc.trim(), color: catColor });
        toast.success('Đã thêm thể loại');
      }
      setCatSheet(null);
    } catch (err) {
      toast.error(errMessage(err, 'Không thể lưu thể loại'));
    }
  };

  const confirmDeleteCat = async () => {
    if (!deletingCat) return false;
    try {
      await deleteCat.mutateAsync(deletingCat.id);
      toast.success('Đã xóa thể loại');
      return true;
    } catch (err) {
      toast.error(errMessage(err, 'Không thể xóa thể loại'));
      return false;
    }
  };

  const openMergeCats = () => {
    setSrcCatId(categories[0]?.id || 0);
    setDstCatId(categories[1]?.id || categories[0]?.id || 0);
    setMergeCatOpen(true);
  };

  const runMergeCats = async () => {
    if (!srcCatId || !dstCatId || srcCatId === dstCatId) {
      toast.error('Chọn 2 thể loại khác nhau');
      return false;
    }
    try {
      const res = await mergeCats.mutateAsync({ sourceId: srcCatId, targetId: dstCatId });
      toast.success(`Đã gộp và chuyển ${res.movedAudios} audio`);
      return true;
    } catch (err) {
      toast.error(errMessage(err));
      return false;
    }
  };

  const handleCreateTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    try {
      await createTag.mutateAsync({ name, slug: toSlug(name) || name.toLowerCase() });
      setNewTag('');
      toast.success('Đã tạo thẻ');
    } catch (err) {
      toast.error(errMessage(err, 'Không thể tạo thẻ'));
    }
  };

  const openEditTag = (t: Tag) => {
    setEditingTag(t);
    setTagName(t.name);
    setTagSlug(t.slug);
  };

  const saveTag = async () => {
    if (!editingTag || !tagName.trim()) return;
    try {
      await updateTag.mutateAsync({
        id: editingTag.id,
        data: { name: tagName.trim(), slug: tagSlug.trim() || toSlug(tagName.trim()) },
      });
      toast.success('Đã cập nhật thẻ');
      setEditingTag(null);
    } catch (err) {
      toast.error(errMessage(err));
    }
  };

  const handleDeleteTag = async (id: number) => {
    try {
      await deleteTag.mutateAsync(id);
      toast.success('Đã xóa thẻ');
    } catch (err) {
      toast.error(errMessage(err, 'Không thể xóa thẻ'));
    }
  };

  const handleCleanupTags = async () => {
    try {
      const res = await cleanupTags.mutateAsync();
      toast.success(`Đã dọn ${res.deleted} thẻ chưa sử dụng`);
    } catch (err) {
      toast.error(errMessage(err));
    }
  };

  const runMergeTags = async () => {
    if (mergeTagSrc.size === 0 || !mergeTagDst) {
      toast.error('Chọn thẻ nguồn và thẻ đích');
      return false;
    }
    try {
      const res = await mergeTags.mutateAsync({ sourceIds: [...mergeTagSrc], targetId: mergeTagDst });
      toast.success(`Đã gộp ${res.merged} thẻ`);
      setMergeTagSrc(new Set());
      return true;
    } catch (err) {
      toast.error(errMessage(err));
      return false;
    }
  };

  const savingCat = createCat.isPending || updateCat.isPending;

  return (
    <AdminPage active="categories">
      <PageTitle
        title="Danh mục"
        action={
          <div className="flex gap-2">
            {categories.length >= 2 && (
              <button
                type="button"
                onClick={openMergeCats}
                aria-label="Gộp thể loại"
                className="btn-comic text-xs py-2 px-2.5 min-h-[40px]"
              >
                <Merge className="w-4 h-4" />
                <span className="hidden sm:inline">Gộp thể loại</span>
              </button>
            )}
            <button
              type="button"
              onClick={openAddCat}
              className="btn-comic btn-comic-yellow text-xs py-2 px-3 min-h-[40px]"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              <span>Thêm thể loại</span>
            </button>
          </div>
        }
      />

      <SearchInput value={query} onChange={setQuery} placeholder="Tìm thể loại hoặc thẻ" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <section className="lg:col-span-7 card-comic p-4 flex flex-col gap-3">
          <h2 className="font-extrabold text-xs uppercase text-[var(--ink-muted)]">
            Thể loại ({filteredCats.length})
          </h2>

          {showSkeleton ? (
            <AdminTableSkeleton rows={4} />
          ) : filteredCats.length === 0 ? (
            <EmptyBox text="Chưa có thể loại phù hợp" />
          ) : (
            <div className="flex flex-col gap-2">
              {filteredCats.slice((safePage - 1) * pageSize, safePage * pageSize).map((c) => {
                const hex = COLORS.find((x) => x.key === c.color)?.hex || '#FFE600';
                return (
                  <div
                    key={c.id}
                    className="card-comic-sm p-3 bg-[var(--surface-elevated)] flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-4 h-4 rounded-md border-2 border-[#111113] shrink-0"
                        style={{ background: hex }}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="font-extrabold text-sm text-[var(--ink-primary)] truncate">
                          {c.name}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--ink-muted)] truncate">
                          {c.slug} · {c.count ?? 0} audio
                          {c.description ? ` · ${c.description}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/audios?categoryId=${c.id}`)}
                        aria-label={`Xem audio ${c.name}`}
                        className="btn-comic text-xs py-2 px-2.5 min-h-[40px]"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditCat(c)}
                        aria-label={`Sửa ${c.name}`}
                        className="btn-comic text-xs py-2 px-2.5 min-h-[40px]"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingCat(c)}
                        aria-label={`Xóa ${c.name}`}
                        className="btn-comic btn-comic-red text-xs py-2 px-2.5 min-h-[40px]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={filteredCats.length}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </section>

        <section className="lg:col-span-5 card-comic p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-extrabold text-xs uppercase text-[var(--ink-muted)]">
              Thẻ ({filteredTags.length})
            </h2>
            <div className="flex gap-1.5">
              {tags.length >= 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setMergeTagSrc(new Set());
                    setMergeTagDst(tags[0]?.id || 0);
                    setMergeTagOpen(true);
                  }}
                  className="btn-comic text-xs py-1 px-2.5 min-h-[34px]"
                >
                  <Merge className="w-3.5 h-3.5" /> Gộp
                </button>
              )}
              <button
                type="button"
                onClick={handleCleanupTags}
                disabled={cleanupTags.isPending}
                className="btn-comic text-xs py-1 px-2.5 min-h-[34px]"
              >
                <Sparkles className="w-3.5 h-3.5" /> Dọn trống
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Tên thẻ mới"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateTag();
                }
              }}
              className="input-comic text-sm flex-1 min-w-0 min-h-[44px]"
            />
            <button
              type="button"
              onClick={handleCreateTag}
              disabled={!newTag.trim() || createTag.isPending}
              className="btn-comic btn-comic-primary text-xs px-3.5 min-h-[44px] shrink-0"
            >
              <Plus className="w-4 h-4" /> Tạo
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {filteredTags.map((t) => (
              <span
                key={t.id}
                className="badge-comic badge-comic-yellow text-xs py-1 px-2.5 flex items-center gap-1.5"
              >
                <button
                  type="button"
                  onClick={() => openEditTag(t)}
                  className="font-bold cursor-pointer hover:underline"
                >
                  #{t.name}
                </button>
                <span className="font-mono text-[10px] opacity-70">{t.count ?? 0}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteTag(t.id)}
                  aria-label={`Xóa thẻ ${t.name}`}
                  className="text-[#111113] hover:text-[#E63946] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={3} />
                </button>
              </span>
            ))}
          </div>
        </section>
      </div>

      <Sheet
        isOpen={Boolean(catSheet)}
        onClose={() => setCatSheet(null)}
        title={catSheet?.mode === 'edit' ? 'Sửa thể loại' : 'Thêm thể loại'}
        footer={
          <button
            type="button"
            disabled={savingCat || !catName.trim()}
            onClick={saveCategory}
            className="btn-comic btn-comic-primary w-full justify-center text-sm py-2.5 min-h-[44px]"
          >
            {savingCat ? 'Đang lưu...' : 'Lưu'}
          </button>
        }
      >
        <Field label="Tên thể loại">
          <input
            type="text"
            value={catName}
            onChange={(e) => {
              setCatName(e.target.value);
              if (catSheet?.mode === 'add') setCatSlug(toSlug(e.target.value));
            }}
            className="input-comic text-sm min-h-[44px]"
          />
        </Field>
        <Field label="Slug">
          <input
            type="text"
            value={catSlug}
            onChange={(e) => setCatSlug(e.target.value)}
            className="input-comic text-sm font-mono min-h-[44px]"
          />
        </Field>
        <Field label="Mô tả">
          <input
            type="text"
            value={catDesc}
            onChange={(e) => setCatDesc(e.target.value)}
            className="input-comic text-sm min-h-[44px]"
          />
        </Field>
        <Field label="Màu hiển thị">
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCatColor(c.key)}
                aria-label={c.key}
                style={{ background: c.hex }}
                className={cn(
                  'w-9 h-9 rounded-lg border-2 border-[#111113] cursor-pointer',
                  catColor === c.key && 'ring-2 ring-offset-2 ring-[#111113]'
                )}
              />
            ))}
          </div>
        </Field>
      </Sheet>

      <Sheet
        isOpen={Boolean(editingTag)}
        onClose={() => setEditingTag(null)}
        title={`Sửa thẻ #${editingTag?.name || ''}`}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (editingTag) navigate(`/admin/audios?tag=${encodeURIComponent(editingTag.slug)}`);
              }}
              className="btn-comic text-sm py-2.5 px-4 min-h-[44px]"
            >
              <ExternalLink className="w-4 h-4" /> Xem audio
            </button>
            <button
              type="button"
              disabled={updateTag.isPending || !tagName.trim()}
              onClick={saveTag}
              className="btn-comic btn-comic-primary flex-1 justify-center text-sm py-2.5 min-h-[44px]"
            >
              {updateTag.isPending ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        }
      >
        <Field label="Tên thẻ">
          <input value={tagName} onChange={(e) => setTagName(e.target.value)} className="input-comic text-sm min-h-[44px]" />
        </Field>
        <Field label="Slug">
          <input value={tagSlug} onChange={(e) => setTagSlug(e.target.value)} className="input-comic text-sm font-mono min-h-[44px]" />
        </Field>
      </Sheet>

      <Modal
        isOpen={mergeCatOpen}
        onClose={() => setMergeCatOpen(false)}
        title="Gộp thể loại"
        confirmText="Gộp ngay"
        size="sm"
        onConfirm={runMergeCats}
      >
        <Field label="Thể loại nguồn (sẽ xóa sau khi chuyển audio)">
          <select value={srcCatId} onChange={(e) => setSrcCatId(Number(e.target.value))} className="input-comic text-sm font-bold">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.count ?? 0})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Thể loại đích">
          <select value={dstCatId} onChange={(e) => setDstCatId(Number(e.target.value))} className="input-comic text-sm font-bold">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.count ?? 0})
              </option>
            ))}
          </select>
        </Field>
      </Modal>

      <Modal
        isOpen={mergeTagOpen}
        onClose={() => setMergeTagOpen(false)}
        title="Gộp thẻ trùng"
        confirmText="Gộp thẻ"
        size="sm"
        onConfirm={runMergeTags}
      >
        <Field label="Thẻ đích (giữ lại)">
          <select value={mergeTagDst} onChange={(e) => setMergeTagDst(Number(e.target.value))} className="input-comic text-sm font-bold">
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.name} ({t.count ?? 0})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Chọn các thẻ nguồn cần gộp">
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
            {tags
              .filter((t) => t.id !== mergeTagDst)
              .map((t) => {
                const picked = mergeTagSrc.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setMergeTagSrc((prev) => {
                        const next = new Set(prev);
                        if (next.has(t.id)) next.delete(t.id);
                        else next.add(t.id);
                        return next;
                      })
                    }
                    className={cn('btn-comic text-xs py-1 px-2', picked && 'btn-comic-yellow')}
                  >
                    #{t.name} ({t.count ?? 0})
                  </button>
                );
              })}
          </div>
        </Field>
      </Modal>

      <Modal
        isOpen={Boolean(deletingCat)}
        onClose={() => setDeletingCat(null)}
        title="Xóa thể loại"
        isDanger
        confirmText="Xóa"
        onConfirm={confirmDeleteCat}
        size="sm"
      >
        <p className="text-sm font-semibold">
          Xóa thể loại “{deletingCat?.name}”? Các audio thuộc thể loại này sẽ được chuyển sang thể loại mặc định.
        </p>
      </Modal>
    </AdminPage>
  );
};
