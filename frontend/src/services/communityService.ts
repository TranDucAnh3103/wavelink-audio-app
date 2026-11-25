import { axiosClient, API_BASE } from '@/lib/axiosClient';
import { CommunityMessage, TopListener, VipRankingMember, WSCommunityMessage, CommunityAdminStats } from '@/types';

const LOCAL_STORAGE_MESSAGES_KEY = 'wavelink_community_messages';
let memoryMessages: CommunityMessage[] = [];

function purgeLegacyCommunityStorage() {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(LOCAL_STORAGE_MESSAGES_KEY);
    } catch {
      // Ignore
    }
  }
}

export const communityService = {
  async getTopListeners(): Promise<TopListener[]> {
    try {
      const res = await axiosClient.get<{ success: boolean; data: TopListener[] }>('/community/leaderboard/top-listeners');
      if (res.data.success && Array.isArray(res.data.data)) {
        return res.data.data;
      }
    } catch (err) {
      console.warn('getTopListeners API error', err);
    }
    return [];
  },

  async getVipLeaderboard(): Promise<VipRankingMember[]> {
    try {
      const res = await axiosClient.get<{ success: boolean; data: VipRankingMember[] }>('/community/leaderboard/vip');
      if (res.data.success && Array.isArray(res.data.data)) {
        return res.data.data;
      }
    } catch (err) {
      console.warn('getVipLeaderboard API error', err);
    }
    return [];
  },

  async getOnlineSummary(): Promise<{ onlineCount: number; vipCount: number; totalMessages: number }> {
    try {
      const res = await axiosClient.get<{ success: boolean; data: { onlineCount: number; vipCount: number; totalMessages: number } }>('/community/online-count');
      if (res.data.success && res.data.data) {
        return res.data.data;
      }
    } catch (err) {
      console.warn('getOnlineSummary API error', err);
    }
    return {
      onlineCount: 0,
      vipCount: 0,
      totalMessages: 0,
    };
  },

  async getMessages(): Promise<CommunityMessage[]> {
    purgeLegacyCommunityStorage();
    try {
      const res = await axiosClient.get<{ success: boolean; data: CommunityMessage[] }>('/community/messages');
      if (res.data.success && Array.isArray(res.data.data)) {
        memoryMessages = res.data.data;
        return res.data.data;
      }
    } catch (err) {
      console.warn('getMessages API error', err);
    }

    return [...memoryMessages];
  },

  async sendMessage(message: string, sharedAudioId?: number, senderName?: string): Promise<CommunityMessage> {
    try {
      const res = await axiosClient.post<{ success: boolean; data: CommunityMessage }>('/community/messages', {
        message,
        sharedAudioId,
        senderName,
      });
      if (res.data.success && res.data.data) {
        return res.data.data;
      }
    } catch (err) {
      console.warn('sendMessage API error, fallback local creation', err);
    }

    // Local fallback message khi mất kết nối mạng
    let savedUser = { username: 'Khách Nghe Thử', isVip: false, role: 'GUEST', id: 0 };
    if (typeof localStorage !== 'undefined') {
      const authUserStr = localStorage.getItem('auth_user');
      if (authUserStr) {
        try {
          const parsed = JSON.parse(authUserStr);
          if (parsed && !parsed.isGuest && parsed.role !== 'GUEST') {
            savedUser = {
              username: parsed.username || 'Bạn',
              isVip: parsed.role === 'VIP' || parsed.role === 'ADMIN',
              role: parsed.role || 'USER',
              id: parsed.id || 0,
            };
          } else if (parsed && parsed.username) {
            savedUser.username = parsed.username;
          }
        } catch {}
      }
    }

    if (senderName) {
      savedUser.username = senderName;
    }

    const fallbackMsg: CommunityMessage = {
      id: String(Date.now()),
      userId: savedUser.id,
      username: savedUser.username,
      message,
      sharedAudioId,
      isVip: savedUser.isVip,
      role: savedUser.role,
      createdAt: new Date().toISOString(),
    };

    purgeLegacyCommunityStorage();
    memoryMessages.push(fallbackMsg);

    return fallbackMsg;
  },

  // Admin moderation endpoints
  async deleteMessage(id: number | string): Promise<boolean> {
    try {
      await axiosClient.delete<{ success: boolean }>(`/community/messages/${id}`);
    } catch (err) {
      console.warn('deleteMessage API warning, ensuring local clean', err);
    }

    purgeLegacyCommunityStorage();
    memoryMessages = memoryMessages.filter((m) => String(m.id) !== String(id));
    return true;
  },

  async clearAllMessages(): Promise<boolean> {
    try {
      await axiosClient.delete<{ success: boolean }>('/community/messages');
    } catch (err) {
      console.warn('clearAllMessages API warning, ensuring local clear', err);
    }

    purgeLegacyCommunityStorage();
    memoryMessages = [];
    return true;
  },

  async getStats(): Promise<CommunityAdminStats> {
    try {
      const res = await axiosClient.get<{ success: boolean; data: CommunityAdminStats }>('/community/stats');
      if (res.data.success && res.data.data) {
        return res.data.data;
      }
    } catch (err) {
      console.error('getCommunityStats API error', err);
    }
    return {
      totalMessages: 0,
      onlineCount: 0,
      vipChatters: 0,
      guestChatters: 0,
    };
  },

  connectWebSocket(onMessage: (msg: WSCommunityMessage) => void): () => void {
    if (typeof window === 'undefined' || !window.WebSocket) {
      return () => {};
    }

    let socket: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let isClosedExplicitly = false;

    const connect = () => {
      try {
        let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let host = window.location.host;

        // Tự động phân giải host cho WebSocket: hỗ trợ cả Localhost, Docker và Cloud Vercel -> Render
        if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
          try {
            const parsedApi = new URL(API_BASE);
            host = parsedApi.host;
            protocol = parsedApi.protocol === 'https:' ? 'wss:' : 'ws:';
          } catch {}
        } else if (API_BASE.includes('8080') || host.includes('5173') || host.includes('3000')) {
          host = window.location.hostname + ':8080';
        }

        // Only send token if not a guest
        let tokenQuery = '';
        const authUserStr = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_user') : null;
        let isGuest = true;
        if (authUserStr) {
          try {
            const u = JSON.parse(authUserStr);
            isGuest = Boolean(u.isGuest || u.role === 'GUEST');
          } catch {}
        }
        if (!isGuest) {
          const token = localStorage.getItem('auth_token');
          if (token) {
            tokenQuery = `?token=${encodeURIComponent(token)}`;
          }
        }

        const wsUrl = `${protocol}//${host}/api/v1/community/ws${tokenQuery}`;

        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          pingInterval = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25000);
        };

        socket.onmessage = (event) => {
          const raw = typeof event.data === 'string' ? event.data : String(event.data || '');
          const chunks = raw.split('\n').filter((line) => line.trim().length > 0);
          for (const chunk of chunks) {
            try {
              const data: WSCommunityMessage = JSON.parse(chunk);
              if (data.type !== 'pong') {
                onMessage(data);
              }
            } catch (e) {
              console.error('Lỗi parse WSCommunityMessage', e);
            }
          }
        };

        socket.onclose = () => {
          if (pingInterval) clearInterval(pingInterval);
          if (!isClosedExplicitly) {
            setTimeout(() => {
              if (!isClosedExplicitly) connect();
            }, 3000);
          }
        };

        socket.onerror = (err) => {
          console.warn('Community WebSocket connection error', err);
          socket?.close();
        };
      } catch (e) {
        console.warn('Could not initialize WebSocket', e);
      }
    };

    connect();

    return () => {
      isClosedExplicitly = true;
      if (pingInterval) clearInterval(pingInterval);
      if (socket) {
        socket.close();
      }
    };
  },
};
