import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones, MessageSquareHeart, Send, ExternalLink, Copy, Share2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { api } from '@/services/api';

export interface ShareStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  audio: {
    id: number;
    title: string;
    author?: string;
    thumbnailUrl?: string;
  };
}

const QUICK_COMMENTS = [
  'Bộ truyện này nghe cuốn thật sự, mọi người cùng vào nghe nhé!',
  'Siêu phẩm đỉnh chóp, không thể bỏ lỡ!',
  'Cày đêm bao phê, giọng đọc quá truyền cảm!',
  'Vừa nghe xong đoạn này hay quá anh em ơi!',
];

export const ShareStoryModal: React.FC<ShareStoryModalProps> = ({ isOpen, onClose, audio }) => {
  const navigate = useNavigate();
  const [commentText, setCommentText] = useState(QUICK_COMMENTS[0]);
  const [isSending, setIsSending] = useState(false);

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleShareToCommunityChat = async () => {
    const text = commentText.trim();
    if (!text) {
      toast.error('Vui lòng nhập lời bình luận');
      return;
    }

    setIsSending(true);
    try {
      await api.community.sendMessage(text, audio.id);
      toast.success('Đã chia sẻ truyện lên Kênh Chat Cộng Đồng!');
      onClose();
    } catch {
      toast.error('Có lỗi xảy ra khi chia sẻ lên cộng đồng.');
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenCommunityWithShare = () => {
    onClose();
    navigate(
      `/community?tab=chat&shareAudioId=${audio.id}&shareTitle=${encodeURIComponent(audio.title)}`
    );
  };

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentUrl);
      toast.success('Đã sao chép liên kết truyện vào bộ nhớ tạm!');
    } else {
      toast.info('Trình duyệt không hỗ trợ sao chép tự động');
    }
  };

  const handleNativeShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: audio.title,
          text: `Đang nghe "${audio.title}" trên WaveLink Audio`,
          url: currentUrl,
        })
        .catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chia Sẻ Truyện"
      showFooter={false}
      size="md"
    >
      <div className="flex flex-col gap-3 py-1">
        {/* Story Preview Card */}
        <div className="card-comic-sm p-2.5 bg-[var(--surface-accent-soft)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg border-2 border-[var(--border-ink)] overflow-hidden bg-[#111113] shrink-0 relative">
            {audio.thumbnailUrl ? (
              <img src={audio.thumbnailUrl} alt={audio.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#FFE600]">
                <Headphones className="w-5 h-5" strokeWidth={2.25} />
              </div>
            )}
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="badge-comic badge-comic-blue text-[8px] py-0 px-1.5 font-bold self-start mb-1">
              AUDIOBOOK
            </span>
            <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate">
              {audio.title}
            </span>
            <span className="text-[11px] font-semibold text-[var(--ink-secondary)] truncate">
              {audio.author || 'Tác giả audio'}
            </span>
          </div>
        </div>

        {/* Section 1: Community Chat Share */}
        <div className="card-comic-sm p-3.5 bg-[var(--surface-elevated)] flex flex-col gap-2.5">
          <div className="flex items-center justify-between border-b border-[var(--border-ink)]/25 pb-2">
            <div className="flex items-center gap-1.5">
              <MessageSquareHeart className="w-4 h-4 text-[#3A86FF]" strokeWidth={2.25} />
              <span className="font-black text-xs uppercase text-[var(--ink-primary)]">
                Gợi Ý: Chat Lên Cộng Đồng
              </span>
            </div>
            <span className="badge-comic badge-comic-teal text-[8px] py-0 px-1.5 font-bold">
              ĐỀ XUẤT
            </span>
          </div>

          <p className="text-[11px] font-semibold text-[var(--ink-secondary)]">
            Đăng ngay lên Phòng Chat để cùng thảo luận và rủ các đạo hữu cày truyện:
          </p>

          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={2}
            className="input-comic text-xs p-2.5 resize-none font-medium"
            placeholder="Viết cảm nghĩ về truyện này..."
          />

          {/* Quick Comment Pills */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_COMMENTS.map((qc, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCommentText(qc)}
                className="text-[10px] font-bold px-2.5 py-1 rounded-full border border-[var(--border-ink)] bg-[var(--surface-card)] text-[var(--ink-secondary)] hover:bg-[#FFE600] hover:text-[#111113] transition-colors truncate max-w-full text-left cursor-pointer"
              >
                {qc}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleShareToCommunityChat}
              disabled={isSending || !commentText.trim()}
              className="btn-comic btn-comic-primary text-xs py-2 px-3 flex-1 flex items-center justify-center gap-1.5 font-black disabled:opacity-60"
            >
              <Send className={`w-3.5 h-3.5 ${isSending ? 'animate-pulse' : ''}`} strokeWidth={2.5} />
              <span>Gửi Ngay Vào Chat</span>
            </button>
            <button
              type="button"
              onClick={handleOpenCommunityWithShare}
              className="btn-comic btn-comic-yellow text-xs py-2 px-3 shrink-0 flex items-center justify-center gap-1.5 font-black"
              title="Đến phòng chat cộng đồng"
            >
              <ExternalLink className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span>Đến Kênh Chat</span>
            </button>
          </div>
        </div>

        {/* Section 2: Other Share Options */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="btn-comic text-xs py-2 px-3 flex-1 font-bold"
          >
            <Copy className="w-3.5 h-3.5" strokeWidth={2.25} />
            <span>Sao Chép Link</span>
          </button>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="btn-comic text-xs py-2 px-3 flex-1 font-bold"
            >
              <Share2 className="w-3.5 h-3.5" strokeWidth={2.25} />
              <span>Ứng Dụng Khác</span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
