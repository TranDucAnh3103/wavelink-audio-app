'use client';

import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { api } from '@/services/api';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { errMessage } from '@/lib/adminFormat';
import { triggerNotificationSync } from '@/hooks/useNotifications';
import { AdminPage, Field, PageTitle } from '@/components/admin/AdminUI';

type Audience = 'all' | 'vip' | 'free' | 'admin';

const AUDIENCES: { key: Audience; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'vip', label: 'VIP' },
  { key: 'free', label: 'Miễn phí' },
  { key: 'admin', label: 'Quản trị' },
];

export const AdminNotifyPage: React.FC = () => {
  const [audience, setAudience] = useState<Audience>('all');
  const [kind, setKind] = useState<'SYSTEM' | 'PROMOTION'>('SYSTEM');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const res = await api.admin.broadcast({
        title,
        message,
        link: link.trim() || undefined,
        type: kind,
        audience,
      });
      toast.success(`Đã gửi tới ${res.delivered}/${res.targeted} người dùng`);
      triggerNotificationSync(true);
      setTitle('');
      setMessage('');
      setLink('');
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPage active="notify">
      <PageTitle title="Thông báo" />

      <div className="card-comic p-4 flex flex-col gap-3.5 max-w-2xl w-full">
        <Field label="Người nhận">
          <div className="grid grid-cols-4 gap-1.5">
            {AUDIENCES.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => setAudience(a.key)}
                className={cn('btn-comic text-xs py-2 min-h-[40px] justify-center px-1', audience === a.key && 'btn-comic-yellow')}
              >
                {a.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Loại">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setKind('SYSTEM')}
              className={cn('btn-comic text-xs py-2 min-h-[40px] justify-center', kind === 'SYSTEM' && 'btn-comic-yellow')}
            >
              Hệ thống
            </button>
            <button
              type="button"
              onClick={() => setKind('PROMOTION')}
              className={cn('btn-comic text-xs py-2 min-h-[40px] justify-center', kind === 'PROMOTION' && 'btn-comic-yellow')}
            >
              Khuyến mãi
            </button>
          </div>
        </Field>

        <Field label="Tiêu đề">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="input-comic text-sm" />
        </Field>
        <Field label="Nội dung">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={5} className="input-comic text-sm resize-none" />
        </Field>
        <Field label="Liên kết (không bắt buộc)">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/membership" className="input-comic text-sm font-mono" />
        </Field>

        <button
          type="button"
          onClick={send}
          disabled={busy || !title.trim() || !message.trim()}
          className="btn-comic btn-comic-primary w-full justify-center text-sm py-2.5 min-h-[46px]"
        >
          <Send className="w-4 h-4" /> {busy ? 'Đang gửi...' : 'Gửi thông báo'}
        </button>
      </div>
    </AdminPage>
  );
};
