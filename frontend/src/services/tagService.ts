import { axiosClient } from '@/lib/axiosClient';
import { Tag, CreateTagPayload } from '@/types';
import { localDb } from './localDb';

export const tagService = {
  async getTags(isLive = true): Promise<Tag[]> {
    if (isLive) {
      try {
        const res = await axiosClient.get<{ success: boolean; data: Tag[] }>('/tags');
        if (res.data.success && Array.isArray(res.data.data)) {
          return res.data.data;
        }
      } catch (err) {
        console.warn('getTags live API failed, fallback to local', err);
      }
    }
    const db = localDb.get();
    return db.tags || [];
  },

  async createTag(payload: CreateTagPayload, isLive = true): Promise<Tag> {
    if (isLive) {
      const res = await axiosClient.post<{ success: boolean; data: Tag }>('/tags', payload);
      if (res.data.success && res.data.data) {
        return res.data.data;
      }
      throw new Error('Không thể tạo thẻ');
    }

    const db = localDb.get();
    const newTag: Tag = {
      id: Date.now(),
      name: payload.name,
      slug: payload.slug || payload.name.toLowerCase().replace(/\s+/g, '-'),
      count: 0,
    };
    db.tags.push(newTag);
    localDb.save();
    return newTag;
  },

  async updateTag(id: number | string, data: Partial<Tag>, isLive = true): Promise<Tag | null> {
    if (isLive) {
      const res = await axiosClient.put<{ success: boolean; data: Tag }>(`/tags/${id}`, data);
      if (res.data.success && res.data.data) return res.data.data;
    }
    return null;
  },

  async mergeTags(sourceIds: number[], targetId: number): Promise<{ merged: number }> {
    const res = await axiosClient.post<{ success: boolean; data: { merged: number } }>('/tags/merge', {
      sourceIds,
      targetId,
    });
    return res.data.data;
  },

  async cleanupUnusedTags(): Promise<{ deleted: number }> {
    const res = await axiosClient.delete<{ success: boolean; data: { deleted: number } }>('/tags/unused');
    return res.data.data;
  },

  async deleteTag(id: number | string, isLive = true): Promise<boolean> {
    if (isLive) {
      const res = await axiosClient.delete<{ success: boolean }>(`/tags/${id}`);
      if (res.data.success) return true;
      throw new Error('Không thể xóa thẻ');
    }

    const db = localDb.get();
    db.tags = db.tags.filter((t) => String(t.id) !== String(id));
    localDb.save();
    return true;
  },
};
