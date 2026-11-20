import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { UploadPage } from '@/views/UploadPage';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';

vi.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [
      { id: 1, name: 'Tiên Hiệp', slug: 'tien-hiep' },
      { id: 2, name: 'Kiếm Hiệp', slug: 'kiem-hiep' },
      { id: 3, name: 'Huyền Huyễn', slug: 'huyen-huyen' },
      { id: 4, name: 'Kinh Dị', slug: 'kinh-di' },
      { id: 5, name: 'Audiobook', slug: 'audiobook' },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useAudio', () => ({
  useImportYouTube: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useImportQuota: () => ({
    data: {
      canImport: true,
      remaining: 5,
      todayImportCount: 0,
      maxImportsPerDay: 5,
    },
    isLoading: false,
  }),
}));

describe('UploadPage - Tag Management & Dynamic Classification', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 1, username: 'TestUser', role: 'USER', isGuest: false },
      token: 'mock-token',
      isLive: false,
      isLoading: false,
      isInitialized: true,
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UploadPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('initializes with an empty tags state by default (no initial tags)', () => {
    renderComponent();
    expect(
      screen.getByText(/Chưa có tag nào \(tự động nhận diện khi nhập link YouTube\)/i)
    ).toBeInTheDocument();
  });

  it('adds tags manually, trims whitespace, strips leading #, and prevents duplicates', () => {
    renderComponent();

    const tagInput = screen.getByPlaceholderText('Thêm tag mới...');
    const addBtn = screen.getByRole('button', { name: /\+ Thêm/i });

    // 1. Thêm tag có dấu # và khoảng trắng thừa
    fireEvent.change(tagInput, { target: { value: '   #TuTiên   ' } });
    fireEvent.click(addBtn);

    // Tag được thêm không có dấu # thừa
    expect(screen.getByText('#TuTiên')).toBeInTheDocument();
    expect(tagInput).toHaveValue('');

    // 2. Thử thêm trùng lặp (không phân biệt hoa thường)
    fireEvent.change(tagInput, { target: { value: 'tutien' } });
    fireEvent.click(addBtn);

    // Không bị nhân đôi
    const allTuTien = screen.getAllByText(/TuTiên/i);
    expect(allTuTien.length).toBe(1);

    // 3. Thêm bằng phím Enter
    fireEvent.change(tagInput, { target: { value: 'Trọn Bộ' } });
    fireEvent.keyDown(tagInput, { key: 'Enter', code: 'Enter' });

    expect(screen.getByText('#Trọn Bộ')).toBeInTheDocument();
  });

  it('removes tags cleanly when clicking the delete x button', () => {
    renderComponent();

    const tagInput = screen.getByPlaceholderText('Thêm tag mới...');
    const addBtn = screen.getByRole('button', { name: /\+ Thêm/i });

    // Thêm 2 tags
    fireEvent.change(tagInput, { target: { value: 'Audiobook' } });
    fireEvent.click(addBtn);
    fireEvent.change(tagInput, { target: { value: 'Kiếm Hiệp' } });
    fireEvent.click(addBtn);

    expect(screen.getByText('#Audiobook')).toBeInTheDocument();
    expect(screen.getByText('#Kiếm Hiệp')).toBeInTheDocument();

    // Xóa tag Audiobook
    const deleteBtn = screen.getByLabelText('Xóa thẻ #Audiobook');
    fireEvent.click(deleteBtn);

    expect(screen.queryByText('#Audiobook')).not.toBeInTheDocument();
    expect(screen.getByText('#Kiếm Hiệp')).toBeInTheDocument();
  });

  it('auto-scans metadata on YouTube preview: sets matching category and extracts tags from hashtags and keywords', async () => {
    vi.spyOn(api.audio, 'previewYouTube').mockResolvedValueOnce({
      videoId: 'test_video_1',
      title: 'Truyện Kiếm Hiệp - Tuyệt Phẩm Giang Hồ Trọn Bộ',
      author: 'Audiobook Channel',
      durationSeconds: 14400,
      formattedDuration: '04:00:00',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      description: 'Nghe truyện hay nhất. #tutien #kiemhiep #audiobook #truyenngan',
    });

    renderComponent();

    const urlInput = screen.getByPlaceholderText('https://www.youtube.com/watch?v=...');
    const checkBtn = screen.getByRole('button', { name: /^Kiểm tra$/i });

    fireEvent.change(urlInput, { target: { value: 'https://www.youtube.com/watch?v=test_video_1' } });
    fireEvent.click(checkBtn);

    // Chờ hệ thống tự động bóc tách và cập nhật UI
    await waitFor(() => {
      // a) Category được tự động chọn Kiếm Hiệp (id=2)
      const categorySelect = screen.getByLabelText(/Thể Loại Truyện/i) as HTMLSelectElement;
      expect(categorySelect.value).toBe('2');

      // b) Tags được trích xuất từ hashtag và từ khóa
      expect(screen.getByText('#Kiếm Hiệp')).toBeInTheDocument();
      expect(screen.getByText('#Tu Tiên')).toBeInTheDocument();
      expect(screen.getByText('#Audiobook')).toBeInTheDocument();
      expect(screen.getByText('#Trọn Bộ')).toBeInTheDocument();
      expect(screen.getByText('#Truyện Ngắn')).toBeInTheDocument();
    });
  });
});
