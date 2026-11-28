import { axiosClient } from '@/lib/axiosClient';
import { Category, CreateCategoryPayload } from '@/types';
import { localDb } from './localDb';

export const categoryService = {
  async getCategories(isLive = true, includeHidden = false): Promise<Category[]> {
    if (isLive) {
      try {
        const res = await axiosClient.get<{ success: boolean; data: Category[] }>('/categories', {
          params: includeHidden ? { includeHidden: 'true' } : undefined,
        });
        if (res.data.success && Array.isArray(res.data.data)) {
          return res.data.data;
        }
      } catch (err) {
        console.warn('getCategories live API failed, fallback to local', err);
      }
    }
    const db = localDb.get();
    return db.categories || [];
  },

  async mergeCategories(sourceId: number, targetId: number): Promise<{ movedAudios: number }> {
    const res = await axiosClient.post<{ success: boolean; data: { movedAudios: number } }>(
      '/categories/merge',
      { sourceId, targetId }
    );
    return res.data.data;
  },

  async createCategory(payload: CreateCategoryPayload, isLive = true): Promise<Category> {
    if (isLive) {
      const res = await axiosClient.post<{ success: boolean; data: Category }>('/categories', payload);
      if (res.data.success && res.data.data) {
        return res.data.data;
      }
      throw new Error('Không thể tạo thể loại');
    }

    const db = localDb.get();
    const newCat: Category = {
      id: Date.now(),
      name: payload.name,
      slug: payload.slug || payload.name.toLowerCase().replace(/\s+/g, '-'),
      description: payload.description || '',
      count: 0,
    };
    db.categories.push(newCat);
    localDb.save();
    return newCat;
  },

  async updateCategory(id: number | string, data: Partial<Category>, isLive = true): Promise<Category | null> {
    if (isLive) {
      const res = await axiosClient.put<{ success: boolean; data: Category }>(`/categories/${id}`, data);
      if (res.data.success && res.data.data) {
        return res.data.data;
      }
      throw new Error('Không thể cập nhật thể loại');
    }

    const db = localDb.get();
    const idx = db.categories.findIndex((c) => String(c.id) === String(id));
    if (idx !== -1) {
      db.categories[idx] = { ...db.categories[idx], ...data };
      localDb.save();
      return db.categories[idx];
    }
    return null;
  },

  async deleteCategory(id: number | string, isLive = true): Promise<boolean> {
    if (isLive) {
      const res = await axiosClient.delete<{ success: boolean }>(`/categories/${id}`);
      if (res.data.success) return true;
      throw new Error('Không thể xóa thể loại');
    }

    const db = localDb.get();
    db.categories = db.categories.filter((c) => String(c.id) !== String(id));
    localDb.save();
    return true;
  },
};
