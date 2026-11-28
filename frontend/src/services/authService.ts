import { axiosClient } from '@/lib/axiosClient';
import { User, LoginPayload, RegisterPayload, AuthResponse } from '@/types';

export const authService = {
  async pingHealth(): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await axiosClient.get('/health', { timeout: 5000 });
        if (res.status === 200) return true;
      } catch {
        // Retry once on transient failure
      }
    }
    return false;
  },

  async login(payload: LoginPayload): Promise<AuthResponse> {
    const res = await axiosClient.post<{ success: boolean; data: AuthResponse; error?: { message?: string } }>('/auth/login', payload);
    if (res.data.success && res.data.data) {
      localStorage.setItem('auth_token', res.data.data.token);
      return res.data.data;
    }
    throw new Error(res.data.error?.message || 'Đăng nhập thất bại');
  },

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const res = await axiosClient.post<{ success: boolean; data: AuthResponse; error?: { message?: string } }>('/auth/register', payload);
    if (res.data.success && res.data.data) {
      localStorage.setItem('auth_token', res.data.data.token);
      return res.data.data;
    }
    throw new Error(res.data.error?.message || 'Đăng ký thất bại');
  },

  async guestLogin(): Promise<AuthResponse> {
    // Không lưu token khách vào localStorage, khách hoạt động ở trạng thái chưa đăng nhập
    localStorage.removeItem('auth_token');
    try {
      const res = await axiosClient.post<{ success: boolean; data: AuthResponse; error?: { message?: string } }>('/auth/guest');
      if (res.data.success && res.data.data) {
        return res.data.data;
      }
    } catch {
      // Offline fallback
    }
    return {
      token: '',
      user: {
        id: 0,
        username: 'Khách Nghe Thử',
        role: 'GUEST',
        isGuest: true,
      },
    };
  },

  async googleLogin(payload: import('@/types').GoogleLoginPayload): Promise<AuthResponse> {
    const res = await axiosClient.post<{ success: boolean; data: AuthResponse; error?: { message?: string } }>('/auth/google', payload);
    if (res.data.success && res.data.data) {
      localStorage.setItem('auth_token', res.data.data.token);
      return res.data.data;
    }
    throw new Error(res.data.error?.message || 'Đăng nhập Google thất bại');
  },

  async getMe(): Promise<User | null> {
    try {
      const res = await axiosClient.get<{ success: boolean; data: User }>('/auth/me');
      const headers = res.headers as Record<string, unknown> | undefined;
      const rawToken =
        headers && typeof (headers as { get?: (k: string) => unknown }).get === 'function'
          ? (headers as { get: (k: string) => unknown }).get('x-refreshed-token')
          : headers?.['x-refreshed-token'];
      if (typeof rawToken === 'string' && rawToken.trim().length > 0 && typeof localStorage !== 'undefined') {
        localStorage.setItem('auth_token', rawToken.trim());
      }
      if (res.data.success) {
        return res.data.data;
      }
    } catch {
      // Ignored if unauthenticated or offline
    }
    return null;
  },

  async logout(): Promise<void> {
    localStorage.removeItem('auth_token');
    try {
      await axiosClient.post('/auth/logout');
    } catch {
      // Ignore
    }
  },
};
