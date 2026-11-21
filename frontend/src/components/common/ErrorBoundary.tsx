import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="card-comic p-8 m-4 max-w-md mx-auto text-center bg-[var(--surface-card)] flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl border-2 border-[#111113] bg-[#E63946] text-white flex items-center justify-center shadow-comic">
            <AlertTriangle className="w-7 h-7" strokeWidth={2.5} />
          </div>
          <h3 className="font-extrabold text-base uppercase text-[var(--ink-primary)]">
            Đã xảy ra lỗi giao diện
          </h3>
          <p className="text-xs font-medium text-[var(--ink-secondary)] max-w-xs">
            Hệ thống gặp sự cố không mong muốn. Bạn có thể tải lại trang hoặc quay về trang chủ.
          </p>
          <div className="flex gap-2 mt-1">
            <Button
              variant="default"
              size="sm"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Thử Lại
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                window.location.href = '/home';
              }}
            >
              Về Trang Chủ
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
