import { create } from 'zustand';
import { User, LoginPayload, RegisterPayload, GoogleLoginPayload } from '@/types';
import { api } from '@/services/api';
import { usePlayerStore, setCurrentPlayerUserId } from '@/stores/playerStore';
import { guestSessionService } from '@/services/guestSessionService';
import { queryClient } from '@/lib/queryClient';
import { toast } from '@/components/ui/Toast';
import { stopBackgroundAudio } from '@/lib/backgroundAudioKeeper';
import { stopBackgroundSleepTimer } from '@/lib/sleepTimerWorker';
import { clearSwrCache } from '@/lib/swrCache';

interface AuthState {
  user: User | null;
  token: string | null;
  isLive: boolean;
  isLoading: boolean;
  isRevalidating: boolean;
  isInitialized: boolean;
  hydrateFromCache: () => void;
  initAuth: () => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  loginWithGoogle: (payload: GoogleLoginPayload) => Promise<void>;
  guestLogin: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (partial: Partial<User>) => void;
  setLiveStatus: (isLive: boolean) => void;
}

function readCachedAuth(): { user: User | null; token: string | null } {
  if (typeof localStorage === 'undefined') {
    return { user: null, token: null };
  }
  const token = localStorage.getItem('auth_token');
  const rawUser = localStorage.getItem('auth_user');
  if (rawUser) {
    try {
      const parsed = JSON.parse(rawUser) as User;
      if (parsed && (parsed.id !== undefined || parsed.isGuest)) {
        return { user: parsed, token };
      }
    } catch {
      // Ignore malformed cached auth
    }
  }
  return { user: null, token };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLive: true,
  isLoading: false,
  isRevalidating: false,
  isInitialized: false,

  hydrateFromCache: () => {
    const { user: current } = get();
    if (current) return;
    const { user: cachedUser, token } = readCachedAuth();
    if (cachedUser) {
      set({ user: cachedUser, token, isInitialized: true });
      if (cachedUser.id) {
        setCurrentPlayerUserId(cachedUser.id);
        usePlayerStore.getState().syncUserPlaybackRate(cachedUser.id);
      } else {
        setCurrentPlayerUserId(null);
        usePlayerStore.getState().syncUserPlaybackRate('guest');
      }
    }
  },

  initAuth: async () => {
    get().hydrateFromCache();
    const hasCachedUser = Boolean(get().user);
    // Only block with loading state if we have a token but no cached user profile yet
    const storedToken = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!hasCachedUser && storedToken) {
      set({ isLoading: true, isRevalidating: true });
    } else {
      set({ isRevalidating: true });
    }

    try {
      const prevLive = get().isLive;
      const isLive = await api.init();
      set({ isLive });
      if (!prevLive && isLive) {
        queryClient.invalidateQueries({ refetchType: 'active' });
      }

      if (storedToken && isLive) {
        const user = await api.auth.getMe();
        if (user) {
          set({ user, token: storedToken, isInitialized: true });
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('auth_user', JSON.stringify(user));
          }
          setCurrentPlayerUserId(user.id);
          usePlayerStore.getState().syncUserPlaybackRate(user.id);
          return;
        }
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }

      // Check offline cached user
      const cachedUserStr = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_user') : null;
      if (cachedUserStr) {
        try {
          const cachedUser = JSON.parse(cachedUserStr);
          if (cachedUser && cachedUser.id) {
            set({ user: cachedUser, token: storedToken, isInitialized: true });
            setCurrentPlayerUserId(cachedUser.id);
            usePlayerStore.getState().syncUserPlaybackRate(cachedUser.id);
            return;
          }
        } catch {}
      }

      // Khách vãng lai: Chưa đăng nhập, không lưu tài khoản vào DB để tránh phình to dữ liệu
      const guestUser: User = {
        id: 0,
        username: 'Khách Nghe Thử',
        role: 'GUEST',
        isGuest: true,
      };
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('auth_token');
        localStorage.setItem('auth_user', JSON.stringify(guestUser));
      }
      setCurrentPlayerUserId(null);
      set({ user: guestUser, token: null, isInitialized: true });
      usePlayerStore.getState().syncUserPlaybackRate('guest');
    } catch (err) {
      console.warn('Auth init error:', err);
    } finally {
      set({ isLoading: false, isRevalidating: false, isInitialized: true });
    }
  },

  login: async (payload: LoginPayload) => {
    set({ isLoading: true });
    try {
      const res = await api.auth.login(payload);
      set({ user: res.user, token: res.token });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('auth_user', JSON.stringify(res.user));
      }
      setCurrentPlayerUserId(res.user.id);
      usePlayerStore.getState().syncUserPlaybackRate(res.user.id);

      // Tự động chuyển tiến trình và lịch sử thao tác của khách trong sessionStorage sang tài khoản user trong DB
      const { progressCount, historyCount } = await guestSessionService.migrateGuestSessionToUser();
      if (progressCount > 0 || historyCount > 0) {
        toast.success(`Đã tự động lưu ${progressCount} tiến trình và lịch sử nghe của bạn vào tài khoản!`);
      }
      queryClient.invalidateQueries();
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (payload: RegisterPayload) => {
    set({ isLoading: true });
    try {
      const res = await api.auth.register(payload);
      set({ user: res.user, token: res.token });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('auth_user', JSON.stringify(res.user));
      }
      usePlayerStore.getState().syncUserPlaybackRate(res.user.id);

      // Tự động chuyển tiến trình và lịch sử thao tác của khách trong sessionStorage sang tài khoản mới trong DB
      const { progressCount, historyCount } = await guestSessionService.migrateGuestSessionToUser();
      if (progressCount > 0 || historyCount > 0) {
        toast.success(`Đã tự động lưu ${progressCount} tiến trình và lịch sử nghe của bạn vào tài khoản mới!`);
      }
      queryClient.invalidateQueries();
    } finally {
      set({ isLoading: false });
    }
  },

  loginWithGoogle: async (payload: GoogleLoginPayload) => {
    set({ isLoading: true });
    try {
      if (get().isLive) {
        const res = await api.auth.googleLogin(payload);
        set({ user: res.user, token: res.token });
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('auth_user', JSON.stringify(res.user));
        }
        setCurrentPlayerUserId(res.user.id);
        usePlayerStore.getState().syncUserPlaybackRate(res.user.id);
        const { progressCount, historyCount } = await guestSessionService.migrateGuestSessionToUser();
        if (progressCount > 0 || historyCount > 0) {
          toast.success(`Đã tự động lưu ${progressCount} tiến trình và lịch sử nghe của bạn vào tài khoản!`);
        }
        queryClient.invalidateQueries();
      } else {
        const candidateName = payload.name || payload.email?.split('@')[0] || 'Google User';
        const googleUser: User = {
          id: Date.now(),
          username: candidateName,
          email: payload.email || 'google@user.local',
          avatarUrl: payload.picture,
          googleId: payload.googleId,
          role: 'USER',
          membership: 'FREE',
          isGuest: false,
        };
        const mockToken = 'mock_google_jwt_' + Date.now();
        localStorage.setItem('auth_token', mockToken);
        localStorage.setItem('auth_user', JSON.stringify(googleUser));
        set({ user: googleUser, token: mockToken });
        setCurrentPlayerUserId(googleUser.id);
        usePlayerStore.getState().syncUserPlaybackRate(googleUser.id);
        const { progressCount, historyCount } = await guestSessionService.migrateGuestSessionToUser();
        if (progressCount > 0 || historyCount > 0) {
          toast.success(`Đã tự động lưu ${progressCount} tiến trình và lịch sử nghe của bạn vào tài khoản!`);
        }
        queryClient.invalidateQueries();
      }
    } finally {
      set({ isLoading: false });
    }
  },

  guestLogin: async () => {
    set({ isLoading: true });
    try {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      setCurrentPlayerUserId(null);
      const guestUser: User = { id: 0, username: 'Khách Nghe Thử', role: 'GUEST', isGuest: true };
      set({ user: guestUser, token: null });
      usePlayerStore.getState().syncUserPlaybackRate('guest');
      queryClient.invalidateQueries();
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    // 1. Dừng phát âm thanh ngay lập tức và reset sạch trạng thái player (tắt mini player dưới nav)
    try {
      usePlayerStore.getState().reset();
      setCurrentPlayerUserId(null);
    } catch (e) {
      console.warn('Error resetting player store on logout:', e);
    }

    // 2. Dừng background audio keeper và background sleep timer nếu đang chạy
    try {
      stopBackgroundAudio();
      stopBackgroundSleepTimer();
    } catch {}

    // 3. Gọi api logout nếu có backend
    try {
      await api.auth.logout();
    } catch {}

    // 4. Xóa sạch token, user profile, web cache và storage cũ
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('wavelink_sleep_timer_end');
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('comic_audio_user_speed_') || k.startsWith('wavelink_cache_'))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {}
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    guestSessionService.clearGuestSession();
    clearSwrCache();

    // 5. Xóa toàn bộ cache dữ liệu của React Query (xóa sạch vết user cũ, không lưu lẫn lộn sang acc khác)
    queryClient.clear();

    const guestUser: User = { id: 0, username: 'Khách Nghe Thử', role: 'GUEST', isGuest: true };
    set({ user: guestUser, token: null });
    usePlayerStore.getState().syncUserPlaybackRate('guest');
  },

  refreshUser: async () => {
    if (get().isLive) {
      const user = await api.auth.getMe();
      if (user) {
        set({ user });
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('auth_user', JSON.stringify(user));
        }
        usePlayerStore.getState().syncUserPlaybackRate(user.id);
      }
    } else {
      const cached = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_user') : null;
      if (cached) {
        try {
          const user = JSON.parse(cached);
          if (user) {
            set({ user });
            usePlayerStore.getState().syncUserPlaybackRate(user.id);
          }
        } catch {}
      }
    }
  },

  updateUser: (partial: Partial<User>) => {
    const current = get().user;
    if (!current) return;
    const updated = { ...current, ...partial };
    set({ user: updated });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('auth_user', JSON.stringify(updated));
    }
    usePlayerStore.getState().syncUserPlaybackRate(updated.id);
  },

  setLiveStatus: (isLive: boolean) => set({ isLive }),
}));
