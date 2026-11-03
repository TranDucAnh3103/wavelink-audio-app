import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Equalizer } from '@/components/ui/Equalizer';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';

describe('UI Primitives', () => {
  describe('Button', () => {
    it('renders text and handles clicks', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click Me</Button>);

      const btn = screen.getByText('Click Me');
      expect(btn).toBeInTheDocument();

      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('renders with variants and disabled state', () => {
      render(
        <Button variant="primary" disabled>
          Disabled Button
        </Button>
      );
      const btn = screen.getByText('Disabled Button');
      expect(btn).toBeDisabled();
      expect(btn).toHaveClass('btn-comic-primary');
    });
  });

  describe('Badge', () => {
    it('renders badge with correct variant classes', () => {
      render(<Badge variant="yellow">TẬP 01</Badge>);
      const badge = screen.getByText('TẬP 01');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('badge-comic-yellow');
    });
  });

  describe('Equalizer', () => {
    it('renders 5 animated equalizer bars', () => {
      const { container } = render(<Equalizer isPlaying={true} />);
      const bars = container.querySelectorAll('.comic-eq-bar');
      expect(bars.length).toBe(5);
    });
  });

  describe('Modal', () => {
    it('renders modal when open and handles confirm', () => {
      const handleConfirm = vi.fn();
      const handleClose = vi.fn();

      render(
        <Modal
          isOpen={true}
          title="TEST MODAL"
          onClose={handleClose}
          onConfirm={handleConfirm}
          confirmText="Đồng ý"
        >
          <p>Nội dung modal</p>
        </Modal>
      );

      expect(screen.getByText('TEST MODAL')).toBeInTheDocument();
      expect(screen.getByText('Nội dung modal')).toBeInTheDocument();

      const confirmBtn = screen.getByText('Đồng ý');
      fireEvent.click(confirmBtn);
      expect(handleConfirm).toHaveBeenCalledTimes(1);
    });

    it('does not render when isOpen is false', () => {
      render(
        <Modal isOpen={false} title="HIDDEN MODAL" onClose={() => {}}>
          <p>Hidden</p>
        </Modal>
      );
      expect(screen.queryByText('HIDDEN MODAL')).not.toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('renders pagination buttons and handles page changes', () => {
      const handlePageChange = vi.fn();
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={60}
          pageSize={12}
          onPageChange={handlePageChange}
        />
      );

      expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument();
      expect(screen.getByText('60')).toBeInTheDocument();
      expect(screen.getByText(/mục/)).toBeInTheDocument();

      const nextBtn = screen.getByTitle('Trang sau');
      fireEvent.click(nextBtn);
      expect(handlePageChange).toHaveBeenCalledWith(2);
    });

    it('does not render when totalPages <= 1 and items <= pageSize', () => {
      const { container } = render(
        <Pagination
          currentPage={1}
          totalPages={1}
          totalItems={10}
          pageSize={12}
          onPageChange={() => {}}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders page 3 button and allows navigating to page 3 directly', () => {
      const handlePageChange = vi.fn();
      render(
        <Pagination
          currentPage={1}
          totalPages={3}
          totalItems={36}
          pageSize={12}
          onPageChange={handlePageChange}
        />
      );

      const page3Btn = screen.getByRole('button', { name: '3' });
      expect(page3Btn).toBeInTheDocument();
      fireEvent.click(page3Btn);
      expect(handlePageChange).toHaveBeenCalledWith(3);
    });

    it('displays page 3 directly from page 1 and page 2 for large page sets (e.g. 10 pages)', () => {
      const handlePageChange = vi.fn();
      const { rerender } = render(
        <Pagination
          currentPage={1}
          totalPages={10}
          totalItems={120}
          pageSize={12}
          onPageChange={handlePageChange}
        />
      );

      // Page 3 must be visible and clickable from page 1
      const page3Btn = screen.getByRole('button', { name: '3' });
      expect(page3Btn).toBeInTheDocument();
      fireEvent.click(page3Btn);
      expect(handlePageChange).toHaveBeenCalledWith(3);

      // From page 2, clicking Next button should navigate to page 3
      rerender(
        <Pagination
          currentPage={2}
          totalPages={10}
          totalItems={120}
          pageSize={12}
          onPageChange={handlePageChange}
        />
      );
      const nextBtn = screen.getByTitle('Trang sau');
      fireEvent.click(nextBtn);
      expect(handlePageChange).toHaveBeenCalledWith(3);
    });
  });
});
