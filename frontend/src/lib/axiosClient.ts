import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useSiteStatusStore } from '@/stores/siteStatusStore';

let onLiveRecoveredCallback: (() => void) | null = null;

export function registerLiveRecoveryHandler(fn: () => void) {
  onLiveRecoveredCallback = fn;
}

const resolveApiBase = (): string => {
  // 1. Runtime Config: Đọc cấu hình môi trường động từ window.__ENV__ (phục vụ Web Hosting zHost không hardcode URL)
  if (typeof window !== 'undefined') {
    const runtimeEnv = (window as unknown as { __ENV__?: { VITE_API_BASE_URL?: string; API_BASE_URL?: string } }).__ENV__;
    const runtimeApi = runtimeEnv?.VITE_API_BASE_URL || runtimeEnv?.API_BASE_URL;
    if (runtimeApi && runtimeApi.trim().length > 0) {
      return runtimeApi.trim().replace(/\/+$/, '');
    }
  }

  // 2. Phân định domain tự động (Đảm bảo Preview Vercel và Production Hosting tách biệt hoàn toàn, không xung đột)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // A. Môi trường UAT / Preview trên Vercel: Luôn kết nối Backend Render Preview (Aiven MySQL)
    if (hostname.includes('vercel.app')) {
      return 'https://wavelink-audio-app-backend-latest.onrender.com/api/v1';
    }

    // B. Môi trường Production trên Web Hosting zHost: Kết nối Cloudflare Quick Tunnel của Home Server
    if (hostname.includes('zhost.education')) {
      return 'https://perth-obj-blackberry-favor.trycloudflare.com/api/v1';
    }

    // C. Môi trường Cục bộ (Local Development)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8080/api/v1';
    }

    // D. Chạy trực tiếp trong container port 8080
    if (window.location.port === '8080' || window.location.origin.includes('8080')) {
      return '/api/v1';
    }
  }

  // 3. Build-time variables (Next.js SSR / Node build / Vite define)
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NEXT_PUBLIC_API_BASE_URL && process.env.NEXT_PUBLIC_API_BASE_URL.trim().length > 0) {
      return process.env.NEXT_PUBLIC_API_BASE_URL.trim().replace(/\/+$/, '');
    }
    if (process.env.VITE_API_BASE_URL && process.env.VITE_API_BASE_URL.trim().length > 0) {
      return process.env.VITE_API_BASE_URL.trim().replace(/\/+$/, '');
    }
    if (typeof window === 'undefined') {
      if (process.env.BACKEND_INTERNAL_URL && process.env.BACKEND_INTERNAL_URL.trim().length > 0) {
        return `${process.env.BACKEND_INTERNAL_URL.trim().replace(/\/+$/, '')}/api/v1`;
      }
      // SSR trên môi trường Vercel: Mặc định trỏ về Render Backend Preview
      if (process.env.VERCEL) {
        return 'https://wavelink-audio-app-backend-latest.onrender.com/api/v1';
      }
    }
  }

  // Fallback an toàn cho môi trường cloud Vercel
  if (typeof process !== 'undefined' && process.env && process.env.VERCEL) {
    return 'https://wavelink-audio-app-backend-latest.onrender.com/api/v1';
  }

  return 'http://localhost:8080/api/v1';
};

// Cấu hình URL Backend API linh hoạt theo biến môi trường NEXT_PUBLIC_API_BASE_URL / VITE_API_BASE_URL
export const API_BASE = resolveApiBase();

export const axiosClient = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const authUserStr = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_user') : null;
    if (authUserStr) {
      try {
        const u = JSON.parse(authUserStr);
        if (u && (u.isGuest || u.role === 'GUEST')) {
          localStorage.removeItem('auth_token');
          if (config.headers) {
            delete config.headers.Authorization;
          }
          return config;
        }
      } catch {}
    }

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export interface ApiError {
  message: string;
  code?: string | number;
  status?: number;
  details?: unknown;
}

export function normalizeError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ message?: string; error?: { message?: string } }>;
    const serverMessage = axiosError.response?.data?.error?.message || axiosError.response?.data?.message;
    return {
      message: serverMessage || axiosError.message || 'Lỗi kết nối máy chủ',
      status: axiosError.response?.status,
      code: axiosError.code,
      details: axiosError.response?.data,
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
    };
  }
  return {
    message: 'Đã xảy ra lỗi không xác định',
  };
}

axiosClient.interceptors.response.use(
  (response) => {
    onLiveRecoveredCallback?.();
    const reqUrl = response.config?.url || '';
    if (!reqUrl.includes('/site-status') && !reqUrl.includes('/admin/')) {
      const siteState = useSiteStatusStore.getState();
      if (siteState.maintenanceMode) {
        siteState.setMaintenance(false);
      }
    }
    return response;
  },
  (error) => {
    const normalized = normalizeError(error);
    const details = normalized.details as { error?: { code?: string }; code?: string } | undefined;
    const errCode = details?.error?.code || details?.code;
    if (normalized.status === 503 && errCode === 'MAINTENANCE_MODE') {
      useSiteStatusStore.getState().setMaintenance(true, normalized.message);
    }
    if (normalized.status === 401) {
      // Optional: Handle token expiration
    }
    return Promise.reject(normalized);
  }
);
