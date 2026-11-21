'use client';

import React, { useState, useEffect } from 'react';
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '@/hooks/useCategories';
import { useTags, useCreateTag, useDeleteTag } from '@/hooks/useTags';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { Category } from '@/types';
import { AdminTabs } from './AdminTabs';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';
import { AdminTableSkeleton } from '@/components/common/Skeletons';

export const AdminCategoriesPage: React.FC = () => {
  const { data: categories = [], isLoading: catLoading } = useCategories();
  const createCatMutation = useCreateCategory();
  const updateCatMutation = useUpdateCategory();
  const deleteCatMutation = useDeleteCategory();

  const { data: tags = [] } = useTags();
  const createTagMutation = useCreateTag();
  const deleteTagMutation = useDeleteTag();

  const [currentCatPage, setCurrentCatPage] = useState(1);
  const pageSize = DEFAULT_PAGE_SIZE;
  const totalCatPages = Math.max(1, Math.ceil(categories.length / pageSize));
  const safeCatPage = Math.min(Math.max(1, currentCatPage), totalCatPages);

  useEffect(() => {
    if (currentCatPage > totalCatPages) {
      setCurrentCatPage(totalCatPages);
    }
  }, [currentCatPage, totalCatPages]);

  const [isAddCatOpen, setIsAddCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatSlug, setNewCatSlug] = useState('');

  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatSlug, setEditCatSlug] = useState('');

  const [deletingCatId, setDeletingCatId] = useState<number | null>(null);
  const [newTagName, setNewTagName] = useState('');

  const showSkeletonFallback = useDelayedFallback(catLoading && categories.length === 0, 180);

  const handleAddCategory = async () => {
    if (!newCatName.trim()) {
      toast.error('Tên thể loại không được để trống');
      return false;
    }
    try {
      await createCatMutation.mutateAsync({
        name: newCatName.trim(),
        slug: newCatSlug.trim() || newCatName.trim().toLowerCase().replace(/\s+/g, '-'),
      });
      toast.success('Đã thêm thể loại mới!');
      setNewCatName('');
      setNewCatSlug('');
      setIsAddCatOpen(false);
      return true;
    } catch {
      toast.error('Lỗi tạo thể loại');
      return false;
    }
  };

  const openEditCategory = (c: Category) => {
    setEditingCat(c);
    setEditCatName(c.name);
    setEditCatSlug(c.slug);
  };

  const handleSaveEditCategory = async () => {
    if (!editingCat) return false;
    if (!editCatName.trim() || !editCatSlug.trim()) {
      toast.error('Tên và slug không được để trống');
      return false;
    }
    try {
      await updateCatMutation.mutateAsync({
        id: editingCat.id,
        data: { name: editCatName.trim(), slug: editCatSlug.trim() },
      });
      toast.success('Đã cập nhật thể loại!');
      setEditingCat(null);
      return true;
    } catch {
      toast.error('Lỗi cập nhật');
      return false;
    }
  };

  const handleDeleteCategory = async () => {
    if (!deletingCatId) return;
    try {
      await deleteCatMutation.mutateAsync(deletingCatId);
      toast.success('Đã xóa thể loại');
      setDeletingCatId(null);
    } catch {
      toast.error('Lỗi xóa thể loại');
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await createTagMutation.mutateAsync({
        name: newTagName.trim(),
        slug: newTagName.trim().toLowerCase().replace(/\s+/g, '-'),
      });
      setNewTagName('');
      toast.success('Đã tạo thẻ tag mới!');
    } catch {
      toast.error('Lỗi tạo tag');
    }
  };

  const handleDeleteTag = async (id: number) => {
    try {
      await deleteTagMutation.mutateAsync(id);
      toast.success('Đã xóa thẻ tag');
    } catch {
      toast.error('Lỗi khi xóa tag');
    }
  };

  return (
    <div className="flex flex-col w-full pb-36 md:pb-28 fade-in-comic">
      <AdminTabs activeTab="categories" />

      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* 1. Categories */}
        <div className="lg:col-span-7 card-comic p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b-2 border-[var(--border-ink)]">
            <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
              Thể Loại Audio
            </span>
            <button
              type="button"
              onClick={() => setIsAddCatOpen(true)}
              className="btn-comic btn-comic-yellow text-[11px] py-1.5 px-3"
            >
              + Thêm Thể Loại
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {showSkeletonFallback ? (
              <AdminTableSkeleton rows={3} />
            ) : categories.length === 0 ? (
              <div className="p-4 text-center text-xs font-bold text-[var(--ink-muted)]">
                Chưa có thể loại nào.
              </div>
            ) : (
              categories
                .slice((safeCatPage - 1) * pageSize, safeCatPage * pageSize)
                .map((c) => (
                  <div
                    key={c.id}
                    className="card-comic-sm p-2.5 bg-[var(--surface-elevated)] flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="badge-comic badge-comic-blue text-[9px] py-0 px-1.5 font-bold truncate">
                        {c.slug}
                      </span>
                      <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate">
                        {c.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditCategory(c)}
                        className="btn-comic text-[11px] py-1 px-2.5"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingCatId(c.id)}
                        className="btn-comic btn-comic-red text-[11px] py-1 px-2.5"
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>

          <Pagination
            currentPage={safeCatPage}
            totalPages={totalCatPages}
            totalItems={categories.length}
            pageSize={pageSize}
            onPageChange={(p) => setCurrentCatPage(p)}
          />
        </div>

        {/* 2. Tags */}
        <div className="lg:col-span-5 card-comic p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b-2 border-[var(--border-ink)]">
            <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
              Thẻ Phân Loại (Tags)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Tên tag mới..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateTag();
                }
              }}
              className="input-comic text-xs flex-1 min-w-0"
            />
            <button
              type="button"
              onClick={handleCreateTag}
              className="btn-comic btn-comic-primary text-xs py-2 px-3 whitespace-nowrap shrink-0"
            >
              + Tạo Tag
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {tags.map((t) => (
              <span
                key={t.id}
                className="badge-comic badge-comic-yellow text-[10px] py-1 px-2 flex items-center gap-1.5"
              >
                #{t.name}
                <button
                  type="button"
                  onClick={() => handleDeleteTag(t.id)}
                  className="font-black text-[#111113] hover:text-[#E63946] cursor-pointer"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Add Category Modal */}
      <Modal
        isOpen={isAddCatOpen}
        onClose={() => setIsAddCatOpen(false)}
        title="TẠO THỂ LOẠI MỚI"
        confirmText="Tạo Ngay"
        onConfirm={handleAddCategory}
        size="sm"
      >
        <div className="flex flex-col gap-2">
          <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
            Tên thể loại
          </label>
          <input
            type="text"
            placeholder="VD: Tiên Hiệp"
            value={newCatName}
            onChange={(e) => {
              setNewCatName(e.target.value);
              setNewCatSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
            }}
            className="input-comic text-xs py-1.5"
          />
          <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)] mt-0.5">
            Slug
          </label>
          <input
            type="text"
            placeholder="VD: tien-hiep"
            value={newCatSlug}
            onChange={(e) => setNewCatSlug(e.target.value)}
            className="input-comic text-xs py-1.5"
          />
        </div>
      </Modal>

      {/* Edit Category Modal */}
      <Modal
        isOpen={Boolean(editingCat)}
        onClose={() => setEditingCat(null)}
        title="SỬA THỂ LOẠI"
        confirmText="Lưu"
        onConfirm={handleSaveEditCategory}
        size="sm"
      >
        <div className="flex flex-col gap-2">
          <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
            Tên thể loại
          </label>
          <input
            type="text"
            value={editCatName}
            onChange={(e) => setEditCatName(e.target.value)}
            className="input-comic text-xs py-1.5"
          />
          <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)] mt-0.5">
            Slug đường dẫn
          </label>
          <input
            type="text"
            value={editCatSlug}
            onChange={(e) => setEditCatSlug(e.target.value)}
            className="input-comic text-xs py-1.5"
          />
        </div>
      </Modal>

      {/* Delete Category Modal */}
      <Modal
        isOpen={Boolean(deletingCatId)}
        onClose={() => setDeletingCatId(null)}
        title="XÓA THỂ LOẠI?"
        isDanger
        confirmText="Xóa"
        onConfirm={handleDeleteCategory}
        size="sm"
      >
        <p className="text-xs font-semibold text-[var(--ink-secondary)] leading-snug">
          Bạn có chắc chắn muốn xóa thể loại này? Các audio thuộc thể loại này sẽ về trạng thái Chung.
        </p>
      </Modal>
    </div>
  );
};
