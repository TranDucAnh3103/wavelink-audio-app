'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users,
  ShieldAlert,
  Crown,
  MessageSquare,
  Trophy,
  Radio,
  Share2,
  MessageCircle,
  Headphones,
  Send,
  RefreshCw,
  Flame,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { toast } from '@/components/ui/Toast';
import { api } from '@/services/api';
import { CommunityListSkeleton } from '@/components/common/Skeletons';
import { CommunityMessage, TopListener, VipRankingMember, WSCommunityMessage } from '@/types';

type TabKey = 'chat' | 'top10' | 'vip';

export const CommunityPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();

  const tabFromUrl = searchParams.get('tab') as TabKey;
  const [activeTab, setActiveTab] = useState<TabKey>(
    tabFromUrl === 'top10' || tabFromUrl === 'vip' ? tabFromUrl : 'chat'
  );

  const shareAudioIdParam = searchParams.get('shareAudioId');
  const shareTitleParam = searchParams.get('shareTitle');

  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [inputVal, setInputVal] = useState<string>(
    shareTitleParam
      ? `Đang nghe truyện "${shareTitleParam}" cực hay, anh em vào nghe cùng nhé!`
      : ''
  );
  const [pendingShareAudioId, setPendingShareAudioId] = useState<number | undefined>(
    shareAudioIdParam ? parseInt(shareAudioIdParam, 10) : undefined
  );
  const [isSending, setIsSending] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [vipCount, setVipCount] = useState<number>(0);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);

  const [topListeners, setTopListeners] = useState<TopListener[]>([]);
  const [loadingTop, setLoadingTop] = useState<boolean>(false);

  const [vipMembers, setVipMembers] = useState<VipRankingMember[]>([]);
  const [loadingVip, setLoadingVip] = useState<boolean>(false);
  const isMountedRef = useRef(true);

  const scrollPageToTop = () => {
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo(0, 0);
    }
  }, []);

  useEffect(() => {
    scrollPageToTop();
  }, [activeTab]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
    scrollPageToTop();
  };

  useEffect(() => {
    isMountedRef.current = true;

    api.community.getOnlineSummary().then((summary) => {
      if (isMountedRef.current && summary) {
        if (summary.onlineCount > 0) setOnlineCount(summary.onlineCount);
        setVipCount(summary.vipCount);
      }
    });

    const loadMessages = async () => {
      try {
        const data = await api.community.getMessages();
        if (isMountedRef.current) {
          setMessages(data);
        }
      } catch (err) {
        console.error('Lỗi tải tin nhắn', err);
      }
    };

    loadMessages();

    const disconnectWs = api.community.connectWebSocket((wsMsg: WSCommunityMessage) => {
      if (!isMountedRef.current) return;

      if (wsMsg.type === 'online_count' && typeof wsMsg.count === 'number') {
        setOnlineCount(wsMsg.count);
      } else if (wsMsg.type === 'new_message' && wsMsg.data) {
        const incoming = wsMsg.data as CommunityMessage;
        setMessages((prev) => {
          if (prev.some((m) => String(m.id) === String(incoming.id))) {
            return prev;
          }
          return [...prev, incoming];
        });
      } else if (wsMsg.type === 'delete_message' && wsMsg.data) {
        const deleted = wsMsg.data as { id: number | string };
        setMessages((prev) => prev.filter((m) => String(m.id) !== String(deleted.id)));
      } else if (wsMsg.type === 'clear_messages') {
        setMessages([]);
      }
    });

    return () => {
      isMountedRef.current = false;
      disconnectWs();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'chat' && chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  const fetchTopListeners = async () => {
    if (!isMountedRef.current) return;
    setLoadingTop(true);
    try {
      const data = await api.community.getTopListeners();
      if (isMountedRef.current) {
        setTopListeners(data);
      }
    } catch {
      if (isMountedRef.current) {
        toast.error('Không thể cập nhật Bảng xếp hạng giờ nghe');
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingTop(false);
      }
    }
  };

  const fetchVipMembers = async () => {
    if (!isMountedRef.current) return;
    setLoadingVip(true);
    try {
      const data = await api.community.getVipLeaderboard();
      if (isMountedRef.current) {
        setVipMembers(data);
      }
    } catch {
      if (isMountedRef.current) {
        toast.error('Không thể cập nhật Bảng vàng VIP');
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingVip(false);
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'top10' && topListeners.length === 0) {
      fetchTopListeners();
    } else if (activeTab === 'vip' && vipMembers.length === 0) {
      fetchVipMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const showTopSkeleton = useDelayedFallback(loadingTop && topListeners.length === 0, 180);
  const showVipSkeleton = useDelayedFallback(loadingVip && vipMembers.length === 0, 180);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputVal.trim();
    if (!text || isSending) return;

    setIsSending(true);
    try {
      const senderName =
        user?.isGuest || user?.role === 'GUEST' || !user?.id ? 'Khách Nghe Thử' : user.username;
      const newMsg = await api.community.sendMessage(text, pendingShareAudioId, senderName);
      setMessages((prev) => {
        if (prev.some((m) => String(m.id) === String(newMsg.id))) {
          return prev;
        }
        return [...prev, newMsg];
      });
      setInputVal('');
      setPendingShareAudioId(undefined);
      if (shareAudioIdParam) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('shareAudioId');
          next.delete('shareTitle');
          return next;
        });
      }
      toast.success('Đã gửi tin nhắn lên cộng đồng!');
    } catch {
      toast.error('Không thể gửi tin nhắn. Vui lòng thử lại!');
    } finally {
      setIsSending(false);
    }
  };

  const formatMsgTime = (isoString?: string) => {
    if (!isoString) return 'Vừa xong';
    try {
      const date = new Date(isoString);
      const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
      if (diffMin < 1) return 'Vừa xong';
      if (diffMin < 60) return `${diffMin} phút trước`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour} giờ trước`;
      return date.toLocaleDateString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Vừa xong';
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-4 pt-2 fade-in-comic">
      {/* 1. Header Banner */}
      <div className="card-comic p-4 bg-[#FFE600] text-[#111113] flex items-center justify-between gap-3 flex-wrap border-2 border-[#111113]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl border-2 border-[#111113] bg-white flex items-center justify-center shadow-comic-sm shrink-0">
            <Users className="w-5 h-5 text-[#3A86FF]" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <h1 className="font-comic font-extrabold text-base md:text-lg uppercase tracking-tight text-[#111113]">
              Cộng Đồng Độc Giả
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === 'ADMIN' && (
            <button
              type="button"
              onClick={() => navigate('/admin/community')}
              className="btn-comic btn-comic-red text-[11px] py-1.5 px-3"
              title="Quản lý cộng đồng"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-[#FFE600]" strokeWidth={2.5} />
              <span>Quản Lý</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/membership')}
            className="btn-comic btn-comic-purple text-[11px] py-1.5 px-3"
          >
            <Crown className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>Lên VIP</span>
          </button>
        </div>
      </div>

      {/* 2. Sub-Tabs Navigation */}
      <div className="flex items-center gap-2 border-b-2 border-[var(--border-ink)] pb-2.5 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => handleTabChange('chat')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 font-black text-xs transition-all cursor-pointer shrink-0 ${
            activeTab === 'chat'
              ? 'bg-[#3A86FF] text-white border-[#111113] shadow-comic-sm -translate-y-0.5'
              : 'bg-[var(--surface-card)] border-[var(--border-ink)] text-[var(--ink-primary)] hover:bg-[var(--surface-muted)]'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" strokeWidth={2.5} />
          <span>Phòng Chat</span>
          <span className="badge-comic badge-comic-teal text-[8px] py-0 px-1.5 ml-0.5 font-bold">
            LIVE
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('top10')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 font-black text-xs transition-all cursor-pointer shrink-0 ${
            activeTab === 'top10'
              ? 'bg-[#FFE600] text-[#111113] border-[#111113] shadow-comic-sm -translate-y-0.5'
              : 'bg-[var(--surface-card)] border-[var(--border-ink)] text-[var(--ink-primary)] hover:bg-[var(--surface-muted)]'
          }`}
        >
          <Trophy className="w-3.5 h-3.5 text-[#D97706]" strokeWidth={2.5} />
          <span>Top 10 Giờ Nghe</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('vip')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 font-black text-xs transition-all cursor-pointer shrink-0 ${
            activeTab === 'vip'
              ? 'bg-[#8338EC] text-white border-[#111113] shadow-comic-sm -translate-y-0.5'
              : 'bg-[var(--surface-card)] border-[var(--border-ink)] text-[var(--ink-primary)] hover:bg-[var(--surface-muted)]'
          }`}
        >
          <Crown className="w-3.5 h-3.5 text-[#FFE600]" strokeWidth={2.5} />
          <span>Bảng Vàng VIP</span>
          {vipCount > 0 && (
            <span className="badge-comic badge-comic-yellow text-[8px] py-0 px-1.5 font-bold">
              {vipCount}
            </span>
          )}
        </button>
      </div>

      {/* Main Responsive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* TAB 1: PHÒNG CHAT REALTIME */}
          {activeTab === 'chat' && (
            <div className="card-comic p-4 flex flex-col gap-3 min-h-[460px] lg:min-h-[540px] relative">
              <div className="flex items-center justify-between pb-2.5 border-b-2 border-[var(--border-ink)]">
                <div className="flex items-center gap-2">
                  <Radio className="w-5 h-5 text-[#3A86FF] animate-pulse" strokeWidth={2.5} />
                  <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
                    Thảo Luận Trực Tuyến
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                  <span className="badge-comic badge-comic-teal text-[9px] font-black">
                    {onlineCount} Online
                  </span>
                </div>
              </div>

              {pendingShareAudioId && (
                <div className="card-comic-sm p-2.5 bg-[var(--surface-accent-soft)] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--ink-primary)] min-w-0">
                    <Share2 className="w-4 h-4 text-[#3A86FF] shrink-0" strokeWidth={2.5} />
                    <span className="truncate">
                      Đang đính kèm truyện:{' '}
                      <span className="font-extrabold underline">{shareTitleParam || 'Truyện hay'}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingShareAudioId(undefined);
                      setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.delete('shareAudioId');
                        next.delete('shareTitle');
                        return next;
                      });
                    }}
                    className="text-xs text-[#E63946] font-bold hover:underline shrink-0 px-1 cursor-pointer"
                    title="Hủy đính kèm"
                  >
                    ✕ Hủy
                  </button>
                </div>
              )}

              <div
                ref={chatListRef}
                className="flex flex-col gap-3 flex-1 max-h-[380px] lg:max-h-[420px] overflow-y-auto no-scrollbar pr-1 pt-1"
              >
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-[var(--ink-muted)] gap-2">
                    <MessageCircle className="w-10 h-10 opacity-50" strokeWidth={1.75} />
                    <span className="text-xs font-bold">
                      Chưa có tin nhắn nào. Hãy là người đầu tiên lên tiếng!
                    </span>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMe = user?.username && m.username === user.username;
                    const isVipMsg = m.isVip || m.role === 'VIP' || m.role === 'ADMIN';
                    const isAdminMsg = m.role === 'ADMIN';

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 px-1">
                          <span
                            onClick={() => {
                              if (m.userId && m.userId > 0) navigate(`/profile/${m.userId}`);
                            }}
                            className={`font-extrabold text-[11px] text-[var(--ink-primary)] flex items-center gap-1 ${
                              m.userId && m.userId > 0 ? 'cursor-pointer hover:underline' : ''
                            }`}
                            title={
                              m.userId && m.userId > 0 ? `Xem hồ sơ của ${m.username}` : undefined
                            }
                          >
                            {m.username}
                            {isAdminMsg ? (
                              <span className="badge-comic badge-comic-red text-[7px] py-0 px-1">
                                ADMIN
                              </span>
                            ) : isVipMsg ? (
                              <span className="badge-comic badge-comic-purple text-[7px] py-0 px-1 font-bold">
                                <Crown className="w-2.5 h-2.5 text-[#FFE600]" /> VIP
                              </span>
                            ) : null}
                          </span>
                          <span className="text-[9px] font-semibold text-[var(--ink-muted)]">
                            {formatMsgTime(m.createdAt)}
                          </span>
                        </div>

                        <div
                          className={`manga-bubble text-xs max-w-[85%] ${
                            isMe
                              ? '!bg-[#D8F3DC] dark:!bg-[#193324]'
                              : isVipMsg
                                ? '!bg-[#FFF9DB] dark:!bg-[#2D2A14]'
                                : '!bg-[var(--surface-elevated)]'
                          }`}
                        >
                          <p className="font-semibold text-[var(--ink-primary)] leading-relaxed whitespace-pre-wrap">
                            {m.message}
                          </p>

                          {(m.sharedAudio || m.sharedAudioId) && (
                            <div
                              onClick={() => {
                                const targetId = m.sharedAudio?.id || m.sharedAudioId;
                                if (targetId) navigate(`/player/${targetId}`);
                              }}
                              className="mt-2 p-2.5 bg-[var(--surface-card)] rounded-xl border-2 border-[var(--border-ink)] flex items-center gap-2.5 shadow-comic-sm cursor-pointer hover:bg-[var(--surface-muted)] transition-all group"
                            >
                              <div className="w-12 h-12 rounded-lg border border-[var(--border-ink)] overflow-hidden bg-[#111113] shrink-0 relative">
                                {m.sharedAudio?.thumbnailUrl ? (
                                  <img
                                    src={m.sharedAudio.thumbnailUrl}
                                    alt={m.sharedAudio.title}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[#FFE600]">
                                    <Headphones className="w-5 h-5" />
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="text-[10px] font-black text-[#3A86FF] uppercase flex items-center gap-1">
                                  <Headphones className="w-3 h-3" /> Truyện Được Chia Sẻ
                                </span>
                                <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate">
                                  {m.sharedAudio?.title || 'Bấm để nghe audio'}
                                </span>
                                <span className="text-[10px] font-semibold text-[var(--ink-muted)] truncate">
                                  {m.sharedAudio?.author || 'Tác giả audio'}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="btn-comic btn-comic-primary text-[10px] py-1 px-2.5 shrink-0"
                              >
                                Nghe
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatBottomRef} />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-[var(--border-ink)]/25">
                {[
                  'Cuốn quá!',
                  'Đang cày truyện',
                  'Giọng đọc đỉnh',
                  'Cho xin link với',
                  'Tuyệt vời',
                ].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setInputVal((prev) => (prev ? `${prev} ${tag}` : tag))}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full border border-[var(--border-ink)] bg-[var(--surface-elevated)] text-[var(--ink-secondary)] hover:bg-[#FFE600] hover:text-[#111113] shrink-0 transition-colors cursor-pointer"
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <form
                onSubmit={handleSendMessage}
                className="flex items-center gap-2 pt-2 border-t-2 border-[var(--border-ink)] mt-auto"
              >
                <input
                  type="text"
                  placeholder={
                    user
                      ? 'Viết bình luận của bạn...'
                      : 'Viết bình luận (với danh tính độc giả)...'
                  }
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  disabled={isSending}
                  className="input-comic text-xs flex-1 min-w-0 font-medium"
                  required
                />
                <button
                  type="submit"
                  disabled={isSending || !inputVal.trim()}
                  className="btn-comic btn-comic-primary text-xs py-2 px-4 shrink-0 disabled:opacity-60"
                >
                  <Send className={`w-3.5 h-3.5 ${isSending ? 'animate-pulse' : ''}`} />
                  <span>Gửi</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: TOP 10 GIỜ NGHE */}
          {activeTab === 'top10' && (
            <div className="card-comic p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2.5 border-b-2 border-[var(--border-ink)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl border-2 border-[#111113] bg-[#FFE600] text-[#111113] flex items-center justify-center shadow-comic-sm shrink-0">
                    <Trophy className="w-5 h-5" strokeWidth={2.5} />
                  </div>
                  <div className="flex flex-col">
                    <h2 className="font-extrabold text-sm uppercase text-[var(--ink-primary)]">
                      Top 10 Cao Thủ Cày Giờ
                    </h2>
                    <span className="text-[10px] font-bold text-[var(--ink-secondary)]">
                      Xếp hạng dựa trên tổng thời lượng nghe audio thực tế
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchTopListeners}
                  disabled={loadingTop}
                  className="btn-comic text-[11px] py-1.5 px-2.5"
                  title="Làm mới bảng xếp hạng"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTop ? 'animate-spin' : ''}`} />
                  <span>Làm mới</span>
                </button>
              </div>

              {showTopSkeleton ? (
                <CommunityListSkeleton count={5} />
              ) : topListeners.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[var(--ink-muted)] gap-2">
                  <Headphones className="w-10 h-10 opacity-40" />
                  <span className="text-xs font-bold text-[var(--ink-secondary)]">
                    Chưa có độc giả nào phát sinh giờ nghe trong hệ thống.
                  </span>
                  <span className="text-[10px]">
                    Hãy là người đầu tiên nghe truyện để lên top!
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {topListeners.map((item) => {
                    const isTop1 = item.rank === 1;
                    const isTop2 = item.rank === 2;
                    const isTop3 = item.rank === 3;

                    return (
                      <div
                        key={item.userId || item.username}
                        className={`card-comic-sm p-3 flex items-center justify-between gap-3 transition-all ${
                          isTop1
                            ? 'bg-[var(--surface-accent-soft)]'
                            : 'bg-[var(--surface-elevated)] hover:bg-[var(--surface-muted)]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-full border-2 border-[#111113] flex items-center justify-center font-black text-xs shrink-0 shadow-comic-sm ${
                              isTop1
                                ? 'bg-[#FFE600] text-[#111113]'
                                : isTop2
                                  ? 'bg-slate-300 text-[#111113]'
                                  : isTop3
                                    ? 'bg-[#F4A261] text-[#111113]'
                                    : 'bg-[var(--surface-card)] text-[var(--ink-primary)] border-[var(--border-ink)]'
                            }`}
                          >
                            #{item.rank}
                          </div>

                          <div className="flex flex-col min-w-0">
                            <div
                              onClick={() => {
                                if (item.userId && item.userId > 0) navigate(`/profile/${item.userId}`);
                              }}
                              className={`flex items-center gap-1.5 ${
                                item.userId && item.userId > 0 ? 'cursor-pointer hover:underline' : ''
                              }`}
                              title={
                                item.userId && item.userId > 0
                                  ? `Xem hồ sơ của ${item.username}`
                                  : undefined
                              }
                            >
                              <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate">
                                {item.username}
                              </span>
                              {item.isVip && (
                                <span className="badge-comic badge-comic-purple text-[8px] py-0 px-1 font-bold">
                                  VIP
                                </span>
                              )}
                              {item.role === 'ADMIN' && (
                                <span className="badge-comic badge-comic-red text-[8px] py-0 px-1">
                                  ADMIN
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-[var(--ink-secondary)] truncate">
                              Đã cày:{' '}
                              <span className="font-black text-[var(--ink-primary)]">
                                {item.totalHours} giờ
                              </span>
                              {item.lastAudioTitle && (
                                <span className="ml-1 text-[var(--ink-muted)] font-semibold truncate">
                                  · Đang nghe: {item.lastAudioTitle}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center">
                          {isTop1 ? (
                            <span className="badge-comic badge-comic-purple text-[9px] font-black py-0.5 px-2">
                              QUÁN QUÂN
                            </span>
                          ) : isTop2 ? (
                            <span className="badge-comic badge-comic-blue text-[9px] font-bold py-0.5 px-2">
                              Á QUÂN
                            </span>
                          ) : isTop3 ? (
                            <span className="badge-comic badge-comic-yellow text-[9px] font-bold py-0.5 px-2">
                              TOP 3
                            </span>
                          ) : (
                            <span className="badge-comic badge-comic-white text-[9px] font-bold py-0.5 px-1.5">
                              TOP {item.rank}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BẢNG VÀNG VIP */}
          {activeTab === 'vip' && (
            <div className="card-comic p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2.5 border-b-2 border-[var(--border-ink)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl border-2 border-[#111113] bg-[#8338EC] flex items-center justify-center shadow-comic-sm shrink-0">
                    <Crown className="w-5 h-5 text-[#FFE600]" strokeWidth={2.5} />
                  </div>
                  <div className="flex flex-col">
                    <h2 className="font-extrabold text-sm uppercase text-[var(--ink-primary)]">
                      Bảng Vàng Độc Giả VIP
                    </h2>
                    <span className="text-[10px] font-bold text-[var(--ink-secondary)]">
                      Vinh danh những thành viên đóng góp và ủng hộ WaveLink Audio
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchVipMembers}
                  disabled={loadingVip}
                  className="btn-comic text-[11px] py-1.5 px-2.5"
                  title="Làm mới bảng vàng VIP"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingVip ? 'animate-spin' : ''}`} />
                  <span>Làm mới</span>
                </button>
              </div>

              {showVipSkeleton ? (
                <CommunityListSkeleton count={5} />
              ) : vipMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-[var(--ink-muted)] gap-2">
                  <Crown className="w-10 h-10 opacity-40" />
                  <span className="text-xs font-bold text-[var(--ink-secondary)]">
                    Chưa có thành viên nào kích hoạt gói VIP.
                  </span>
                  <span className="text-[10px]">
                    Đăng ký VIP để nhận huy hiệu bảng vàng độc quyền!
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate('/membership')}
                    className="btn-comic btn-comic-purple text-xs py-1.5 px-3 mt-1"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>Nâng Cấp VIP Ngay</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {vipMembers.map((m) => {
                    const isAdmin = m.role === 'ADMIN';

                    return (
                      <div
                        key={m.userId || m.username}
                        className="card-comic-sm p-3 bg-[var(--surface-elevated)] flex items-center justify-between gap-3 hover:border-[#8338EC] transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl border-2 border-[#111113] bg-gradient-to-tr from-[#7209B7] to-[#F72585] flex items-center justify-center font-black text-white shrink-0 shadow-comic-sm">
                            {isAdmin ? (
                              <ShieldAlert className="w-5 h-5 text-[#FFE600]" />
                            ) : (
                              <Crown className="w-5 h-5 text-[#FFE600]" />
                            )}
                          </div>

                          <div className="flex flex-col min-w-0">
                            <div
                              onClick={() => {
                                if (m.userId && m.userId > 0) navigate(`/profile/${m.userId}`);
                              }}
                              className={`flex items-center gap-1.5 flex-wrap ${
                                m.userId && m.userId > 0 ? 'cursor-pointer hover:underline' : ''
                              }`}
                              title={
                                m.userId && m.userId > 0 ? `Xem hồ sơ của ${m.username}` : undefined
                              }
                            >
                              <span className="font-extrabold text-xs text-[var(--ink-primary)]">
                                {m.username}
                              </span>
                              <span className="badge-comic badge-comic-purple text-[8px] py-0 px-1.5 font-black">
                                {m.vipBadge}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-[var(--ink-secondary)] mt-0.5">
                              Đã cày:{' '}
                              <span className="font-black text-[var(--ink-primary)]">
                                {m.totalHours} giờ truyện
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center">
                          <span className="badge-comic badge-comic-yellow text-[9px] font-black py-0.5 px-2">
                            {isAdmin ? 'ĐIỀU HÀNH' : 'VIP MEMBER'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop Sidebar Info Panel */}
        <aside className="lg:col-span-4 flex flex-col gap-4 lg:sticky lg:top-20">
          <div className="card-comic p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-comic font-black text-xs uppercase text-[var(--ink-primary)]">
                Thống Kê Trực Tuyến
              </span>
              <span className="badge-comic badge-comic-teal text-[9px]">{onlineCount} Online</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="card-comic-sm p-2.5 bg-[var(--surface-elevated)] flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-[var(--ink-muted)] uppercase">
                  Tin nhắn
                </span>
                <span className="font-comic font-black text-lg text-[var(--ink-primary)]">
                  {messages.length}
                </span>
              </div>
              <div className="card-comic-sm p-2.5 bg-[var(--surface-elevated)] flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-[var(--ink-muted)] uppercase">
                  Thành viên VIP
                </span>
                <span className="font-comic font-black text-lg text-[#8338EC]">
                  {vipCount}
                </span>
              </div>
            </div>
          </div>

          <div className="card-comic p-4 bg-gradient-to-br from-[#8338EC]/15 via-[#F72585]/10 to-[#FFE600]/20 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-[#E63946]" strokeWidth={2.5} />
              <span className="font-black text-xs uppercase text-[var(--ink-primary)]">
                Muốn xuất hiện trên Bảng Vàng VIP?
              </span>
            </div>
            <p className="text-xs font-medium text-[var(--ink-secondary)] leading-relaxed">
              Đăng ký gói VIP để mở khóa kho truyện không giới hạn, tập 4 giờ nghe mượt mà và nhận huy hiệu danh dự trong phòng chat cộng đồng!
            </p>
            <button
              type="button"
              onClick={() => navigate('/membership')}
              className="btn-comic btn-comic-purple text-xs py-2 px-4 self-start mt-1"
            >
              <Crown className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span>Nâng Cấp VIP Ngay</span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
