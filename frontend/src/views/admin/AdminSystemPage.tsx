'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Sliders, Radio, History, Save, Trash2, Activity, RefreshCw } from 'lucide-react';
import { api } from '@/services/api';
import { toast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/utils';
import { errMessage, formatDateTime } from '@/lib/adminFormat';
import type { AuditLogItem, Paged, SiteConfig, StreamStatus } from '@/types/admin';
import {
  AdminPage,
  EmptyBox,
  Field,
  PageTitle,
  SearchInput,
  Spinner,
  StatTile,
  useDebounced,
} from '@/components/admin/AdminUI';

type SystemTab = 'config' | 'stream' | 'audit';

export const AdminSystemPage: React.FC = () => {
  const [tab, setTab] = useState<SystemTab>('config');

  const [cfg, setCfg] = useState<SiteConfig>({
    freeImportDailyLimit: 5,
    allowUserImport: true,
    allowGuestChat: true,
    maintenanceMode: false,
    maintenanceMessage: '',
  });
  const [savingCfg, setSavingCfg] = useState(false);

  const [stream, setStream] = useState<StreamStatus | null>(null);
  const [clearing, setClearing] = useState(false);
  const [probing, setProbing] = useState(false);

  const [auditQuery, setAuditQuery] = useState('');
  const aq = useDebounced(auditQuery);
  const [auditPage, setAuditPage] = useState(1);
  const [audits, setAudits] = useState<Paged<AuditLogItem> | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const loadConfig = useCallback(() => {
    api.admin.settings().then(setCfg).catch((err) => toast.error(errMessage(err)));
  }, []);

  const loadStream = useCallback(() => {
    api.admin.streamStatus().then(setStream).catch((err) => toast.error(errMessage(err)));
  }, []);

  const loadAudits = useCallback(() => {
    setAuditLoading(true);
    api.admin
      .auditLogs({ q: aq, page: auditPage, pageSize: 20 })
      .then(setAudits)
      .catch((err) => toast.error(errMessage(err)))
      .finally(() => setAuditLoading(false));
  }, [aq, auditPage]);

  useEffect(() => {
    if (tab === 'config') loadConfig();
    if (tab === 'stream') loadStream();
    if (tab === 'audit') loadAudits();
  }, [tab, loadConfig, loadStream, loadAudits]);

  useEffect(() => setAuditPage(1), [aq]);

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCfg(true);
    try {
      const updated = await api.admin.updateSettings(cfg);
      setCfg(updated);
      toast.success('Đã lưu cấu hình hệ thống');
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setSavingCfg(false);
    }
  };

  const clearAllCache = async () => {
    setClearing(true);
    try {
      const res = await api.admin.clearStreamCache();
      toast.success(`Đã xóa ${res.cleared} mục cache`);
      loadStream();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setClearing(false);
    }
  };

  const batchProbe = async () => {
    setProbing(true);
    try {
      const res = await api.admin.checkStreamsBatch();
      toast.success(`Đã kiểm tra ${res.checked} audio (${res.ok} tốt, ${res.failed} lỗi)`);
      loadStream();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setProbing(false);
    }
  };

  return (
    <AdminPage active="system">
      <PageTitle title="Hệ thống" />

      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl border-2 border-[var(--border-ink)] bg-[var(--surface-muted)] max-w-lg">
        {[
          { key: 'config' as const, label: 'Cấu hình', icon: Sliders },
          { key: 'stream' as const, label: 'Luồng & Cache', icon: Radio },
          { key: 'audit' as const, label: 'Nhật ký', icon: History },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]',
              tab === t.key
                ? 'bg-[#FFE600] text-[#111113] border-2 border-[#111113]'
                : 'text-[var(--ink-secondary)]'
            )}
          >
            <t.icon className="w-4 h-4" /> <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'config' && (
        <form onSubmit={saveConfig} className="card-comic p-4 flex flex-col gap-3.5 max-w-2xl">
          <Field label="Giới hạn import YouTube / ngày (tài khoản thường)">
            <input
              type="number"
              min={1}
              max={1000}
              value={cfg.freeImportDailyLimit}
              onChange={(e) =>
                setCfg({ ...cfg, freeImportDailyLimit: Math.max(1, Number(e.target.value) || 1) })
              }
              className="input-comic text-sm font-mono font-bold min-h-[44px]"
            />
          </Field>

          <label className="flex items-center justify-between gap-3 card-comic-sm p-3 cursor-pointer">
            <span className="text-sm font-extrabold text-[var(--ink-primary)]">
              Cho phép tài khoản thường tự import YouTube
            </span>
            <input
              type="checkbox"
              checked={cfg.allowUserImport}
              onChange={(e) => setCfg({ ...cfg, allowUserImport: e.target.checked })}
              className="w-5 h-5 accent-[#8338EC]"
            />
          </label>

          <label className="flex items-center justify-between gap-3 card-comic-sm p-3 cursor-pointer">
            <span className="text-sm font-extrabold text-[var(--ink-primary)]">
              Cho phép khách vãng lai gửi tin nhắn cộng đồng
            </span>
            <input
              type="checkbox"
              checked={cfg.allowGuestChat}
              onChange={(e) => setCfg({ ...cfg, allowGuestChat: e.target.checked })}
              className="w-5 h-5 accent-[#8338EC]"
            />
          </label>

          <label className="flex items-center justify-between gap-3 card-comic-sm p-3 cursor-pointer">
            <span className="text-sm font-extrabold text-[var(--ink-primary)]">
              Chế độ bảo trì
            </span>
            <input
              type="checkbox"
              checked={cfg.maintenanceMode}
              onChange={(e) => setCfg({ ...cfg, maintenanceMode: e.target.checked })}
              className="w-5 h-5 accent-[#E63946]"
            />
          </label>

          {cfg.maintenanceMode && (
            <Field label="Thông báo bảo trì">
              <input
                type="text"
                value={cfg.maintenanceMessage}
                onChange={(e) => setCfg({ ...cfg, maintenanceMessage: e.target.value })}
                className="input-comic text-sm min-h-[44px]"
              />
            </Field>
          )}

          <button
            type="submit"
            disabled={savingCfg}
            className="btn-comic btn-comic-primary w-full sm:w-fit justify-center text-sm py-2.5 px-5 min-h-[44px]"
          >
            <Save className="w-4 h-4" />
            <span>{savingCfg ? 'Đang lưu...' : 'Lưu cấu hình'}</span>
          </button>
        </form>
      )}

      {tab === 'stream' && (
        <div className="flex flex-col gap-3">
          {!stream ? (
            <Spinner />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile
                  label="Extractor"
                  value={stream.extractorReady ? 'Sẵn sàng' : 'Chưa bật'}
                  icon={Radio}
                  tone={stream.extractorReady ? 'teal' : 'red'}
                />
                <StatTile label="Cache URL" value={stream.cacheEntries} icon={RefreshCw} tone="blue" />
                <StatTile label="Luồng ổn định" value={stream.streamOK} icon={Activity} tone="teal" />
                <StatTile
                  label="Lỗi / Chưa rõ"
                  value={`${stream.streamFailed} / ${stream.streamUnknown}`}
                  icon={Activity}
                  tone="red"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={probing}
                  onClick={batchProbe}
                  className="btn-comic btn-comic-yellow text-xs py-2.5 px-4 min-h-[44px]"
                >
                  <Activity className={cn('w-4 h-4', probing && 'animate-pulse')} />
                  <span>{probing ? 'Đang kiểm tra...' : 'Kiểm tra luồng lỗi / chưa rõ'}</span>
                </button>
                <button
                  type="button"
                  disabled={clearing}
                  onClick={clearAllCache}
                  className="btn-comic btn-comic-red text-xs py-2.5 px-4 min-h-[44px]"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{clearing ? 'Đang xóa...' : 'Xóa toàn bộ Stream Cache'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="flex flex-col gap-3">
          <SearchInput value={auditQuery} onChange={setAuditQuery} placeholder="Tìm theo admin, hành động, đối tượng" />
          {auditLoading && !audits ? (
            <Spinner />
          ) : !audits || audits.items.length === 0 ? (
            <EmptyBox text="Chưa có nhật ký quản trị" />
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {audits.items.map((log) => (
                  <div key={log.id} className="card-comic-sm p-3 bg-[var(--surface-card)] flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-xs text-[var(--ink-primary)]">{log.adminName}</span>
                        <span className="badge-comic badge-comic-yellow text-[10px] py-0 px-1.5 font-mono">{log.action}</span>
                        {log.targetType && (
                          <span className="badge-comic badge-comic-white text-[10px] py-0 px-1.5 font-mono">
                            {log.targetType}#{log.targetId}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold text-[var(--ink-muted)]">
                        {formatDateTime(log.createdAt)}
                      </span>
                    </div>
                    {(log.targetName || log.detail) && (
                      <span className="text-xs font-semibold text-[var(--ink-secondary)]">
                        {[log.targetName, log.detail].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <Pagination
                currentPage={auditPage}
                totalPages={Math.max(1, Math.ceil(audits.total / 20))}
                totalItems={audits.total}
                pageSize={20}
                onPageChange={setAuditPage}
              />
            </>
          )}
        </div>
      )}
    </AdminPage>
  );
};
