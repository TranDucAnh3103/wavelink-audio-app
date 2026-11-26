'use client';

import React, { useState, useEffect } from 'react';
import { Landmark, Tag, RotateCcw, Save, Plus, X } from 'lucide-react';
import {
  useMembershipPackages,
  usePaymentInfo,
  useUpdatePaymentInfo,
  useUpdatePackages,
  useResetPackages,
} from '@/hooks/useMembership';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { MembershipPackage } from '@/types';
import { toast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { cn, formatVND } from '@/lib/utils';
import { errMessage } from '@/lib/adminFormat';
import { AdminVipSkeleton } from '@/components/common/Skeletons';
import { AdminPage, Field, PageTitle } from '@/components/admin/AdminUI';

type VipTab = 'packages' | 'bank';

export const AdminVipPage: React.FC = () => {
  const { data: serverPackages = [], isLoading: pkgsLoading } = useMembershipPackages();
  const { data: serverPaymentInfo, isLoading: payLoading } = usePaymentInfo();

  const updatePaymentInfo = useUpdatePaymentInfo();
  const updatePackages = useUpdatePackages();
  const resetPackages = useResetPackages();

  const [tab, setTab] = useState<VipTab>('packages');
  const [resetOpen, setResetOpen] = useState(false);

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [notePrefix, setNotePrefix] = useState('VIP');
  const [packages, setPackages] = useState<MembershipPackage[]>([]);

  useEffect(() => {
    if (serverPaymentInfo) {
      setBankName(serverPaymentInfo.bankName || '');
      setAccountNumber(serverPaymentInfo.accountNumber || '');
      setAccountName(serverPaymentInfo.accountName || '');
      setNotePrefix(serverPaymentInfo.notePrefix || 'VIP');
    }
  }, [serverPaymentInfo]);

  useEffect(() => {
    if (serverPackages.length > 0) {
      setPackages(JSON.parse(JSON.stringify(serverPackages)));
    }
  }, [serverPackages]);

  const showSkeleton = useDelayedFallback(
    (pkgsLoading || payLoading) && serverPackages.length === 0,
    180
  );

  const saveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) {
      toast.error('Vui lòng điền đầy đủ ngân hàng, số tài khoản và chủ tài khoản');
      return;
    }
    try {
      await updatePaymentInfo.mutateAsync({
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim().toUpperCase(),
        notePrefix: notePrefix.trim().toUpperCase() || 'VIP',
      });
      toast.success('Đã lưu thông tin thanh toán');
    } catch (err) {
      toast.error(errMessage(err, 'Không thể lưu thông tin thanh toán'));
    }
  };

  const updateField = (index: number, field: keyof MembershipPackage, val: unknown) =>
    setPackages((prev) => prev.map((pkg, idx) => (idx === index ? { ...pkg, [field]: val } : pkg)));

  const updatePrice = (index: number, val: number) =>
    setPackages((prev) =>
      prev.map((pkg, idx) => (idx === index ? { ...pkg, priceVND: val, amount: val } : pkg))
    );

  const updatePerk = (pkgIndex: number, perkIndex: number, val: string) =>
    setPackages((prev) =>
      prev.map((pkg, i) =>
        i === pkgIndex
          ? { ...pkg, perks: (pkg.perks || []).map((p, j) => (j === perkIndex ? val : p)) }
          : pkg
      )
    );

  const addPerk = (pkgIndex: number) =>
    setPackages((prev) =>
      prev.map((pkg, i) =>
        i === pkgIndex ? { ...pkg, perks: [...(pkg.perks || []), ''] } : pkg
      )
    );

  const removePerk = (pkgIndex: number, perkIndex: number) =>
    setPackages((prev) =>
      prev.map((pkg, i) =>
        i === pkgIndex
          ? { ...pkg, perks: (pkg.perks || []).filter((_, j) => j !== perkIndex) }
          : pkg
      )
    );

  const savePackages = async () => {
    try {
      const sanitized = packages.map(({ isLocked: _l, isCurrent: _c, canUpgrade: _u, ...rest }) => ({
        ...rest,
        perks: (rest.perks || []).map((p) => p.trim()).filter(Boolean),
      }));
      await updatePackages.mutateAsync(sanitized);
      toast.success('Đã lưu cấu hình gói VIP');
    } catch (err) {
      toast.error(errMessage(err, 'Không thể lưu gói VIP'));
    }
  };

  const confirmReset = async () => {
    try {
      await resetPackages.mutateAsync();
      toast.success('Đã khôi phục gói mặc định');
      return true;
    } catch (err) {
      toast.error(errMessage(err, 'Không thể khôi phục mặc định'));
      return false;
    }
  };

  if (showSkeleton) {
    return (
      <AdminPage active="vip">
        <AdminVipSkeleton />
      </AdminPage>
    );
  }

  const qrUrl = accountNumber.trim()
    ? `https://img.vietqr.io/image/970422-${encodeURIComponent(accountNumber.trim())}-compact2.png?amount=49000&addInfo=${encodeURIComponent(
        `${notePrefix.trim() || 'VIP'}-12345`
      )}&accountName=${encodeURIComponent(accountName.trim())}`
    : '';

  return (
    <AdminPage active="vip">
      <PageTitle
        title="Gói VIP"
        action={
          tab === 'packages' ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                disabled={resetPackages.isPending}
                aria-label="Khôi phục mặc định"
                className="btn-comic text-xs py-2 px-2.5 min-h-[40px]"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Mặc định</span>
              </button>
              <button
                type="button"
                onClick={savePackages}
                disabled={updatePackages.isPending}
                className="btn-comic btn-comic-yellow text-xs py-2 px-3 min-h-[40px]"
              >
                <Save className="w-4 h-4" />
                <span>{updatePackages.isPending ? 'Đang lưu...' : 'Lưu'}</span>
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl border-2 border-[var(--border-ink)] bg-[var(--surface-muted)] max-w-md">
        <button
          type="button"
          onClick={() => setTab('packages')}
          className={cn(
            'py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]',
            tab === 'packages'
              ? 'bg-[#FFE600] text-[#111113] border-2 border-[#111113]'
              : 'text-[var(--ink-secondary)]'
          )}
        >
          <Tag className="w-4 h-4" /> Bảng giá ({packages.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('bank')}
          className={cn(
            'py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]',
            tab === 'bank'
              ? 'bg-[#FFE600] text-[#111113] border-2 border-[#111113]'
              : 'text-[var(--ink-secondary)]'
          )}
        >
          <Landmark className="w-4 h-4" /> VietQR
        </button>
      </div>

      {tab === 'packages' ? (
        <div className="flex flex-col gap-4">
          {packages.map((pkg, pIdx) => (
            <div key={pkg.id} className="card-comic p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-ink)]/25">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="badge-comic badge-comic-yellow text-[10px] font-black shrink-0">
                    {pkg.id}
                  </span>
                  <span className="font-extrabold text-sm text-[var(--ink-primary)] truncate">
                    {pkg.name}
                  </span>
                </div>
                <span className="font-mono font-black text-sm text-[#E63946] shrink-0">
                  {formatVND(pkg.priceVND || pkg.amount || 0)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Tên gói">
                  <input
                    type="text"
                    value={pkg.name}
                    onChange={(e) => updateField(pIdx, 'name', e.target.value)}
                    className="input-comic text-sm font-bold min-h-[42px]"
                  />
                </Field>
                <Field label="Giá bán (VNĐ)">
                  <input
                    type="number"
                    min={0}
                    value={pkg.priceVND || pkg.amount || 0}
                    onChange={(e) => updatePrice(pIdx, Math.max(0, Number(e.target.value) || 0))}
                    className="input-comic text-sm font-mono font-bold min-h-[42px]"
                  />
                </Field>
                <Field label="Thời hạn (ngày)">
                  <input
                    type="number"
                    min={1}
                    value={pkg.durationDays}
                    onChange={(e) =>
                      updateField(pIdx, 'durationDays', Math.max(1, Number(e.target.value) || 1))
                    }
                    className="input-comic text-sm font-mono font-bold min-h-[42px]"
                  />
                </Field>
                <Field label="Giá gốc (VNĐ)">
                  <input
                    type="number"
                    min={0}
                    value={pkg.originalCost || 0}
                    onChange={(e) =>
                      updateField(pIdx, 'originalCost', Math.max(0, Number(e.target.value) || 0))
                    }
                    className="input-comic text-sm font-mono font-bold min-h-[42px]"
                  />
                </Field>
                <Field label="Nhãn ưu đãi">
                  <input
                    type="text"
                    value={pkg.discount || ''}
                    onChange={(e) => updateField(pIdx, 'discount', e.target.value)}
                    className="input-comic text-sm font-bold min-h-[42px]"
                  />
                </Field>
                <Field label="Mô tả">
                  <input
                    type="text"
                    value={pkg.description}
                    onChange={(e) => updateField(pIdx, 'description', e.target.value)}
                    className="input-comic text-sm min-h-[42px]"
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-ink)]/20">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase text-[var(--ink-secondary)]">
                    Đặc quyền ({pkg.perks?.length || 0})
                  </span>
                  <button
                    type="button"
                    onClick={() => addPerk(pIdx)}
                    className="btn-comic text-xs py-1 px-2.5 min-h-[34px]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(pkg.perks || []).map((perk, perkIdx) => (
                    <div key={perkIdx} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={perk}
                        onChange={(e) => updatePerk(pIdx, perkIdx, e.target.value)}
                        className="input-comic text-xs py-2 flex-1 min-h-[40px]"
                      />
                      <button
                        type="button"
                        onClick={() => removePerk(pIdx, perkIdx)}
                        aria-label="Xóa đặc quyền"
                        className="w-10 h-10 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-card)] flex items-center justify-center text-[#E63946] shrink-0 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <form onSubmit={saveBank} className="card-comic p-4 flex flex-col gap-3.5 max-w-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Ngân hàng">
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="input-comic text-sm font-bold min-h-[44px]"
                required
              />
            </Field>
            <Field label="Số tài khoản">
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="input-comic text-sm font-mono font-bold min-h-[44px]"
                required
              />
            </Field>
            <Field label="Chủ tài khoản">
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="input-comic text-sm font-bold uppercase min-h-[44px]"
                required
              />
            </Field>
            <Field label="Tiền tố nội dung">
              <input
                type="text"
                value={notePrefix}
                onChange={(e) => setNotePrefix(e.target.value)}
                className="input-comic text-sm font-mono font-bold uppercase min-h-[44px]"
              />
            </Field>
          </div>

          {qrUrl && (
            <div className="card-comic-sm p-3 bg-[var(--surface-elevated)] flex items-center gap-3">
              <div className="w-20 h-20 rounded-lg border-2 border-[var(--border-ink)] bg-white p-1 shrink-0 overflow-hidden">
                <img src={qrUrl} alt="VietQR" className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-col min-w-0 text-xs font-semibold text-[var(--ink-secondary)] gap-0.5">
                <span className="font-extrabold text-[var(--ink-primary)] truncate">{bankName}</span>
                <span className="font-mono truncate">{accountNumber}</span>
                <span className="truncate uppercase">{accountName}</span>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={updatePaymentInfo.isPending}
            className="btn-comic btn-comic-teal w-full sm:w-fit sm:ml-auto justify-center text-sm py-2.5 px-5 min-h-[44px]"
          >
            <Save className="w-4 h-4" />
            <span>{updatePaymentInfo.isPending ? 'Đang lưu...' : 'Lưu tài khoản'}</span>
          </button>
        </form>
      )}

      <Modal
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Khôi phục gói mặc định"
        confirmText="Khôi phục"
        isDanger
        size="sm"
        onConfirm={confirmReset}
      >
        <p className="text-sm font-semibold">
          Toàn bộ bảng giá và đặc quyền gói VIP sẽ quay về cấu hình mặc định.
        </p>
      </Modal>
    </AdminPage>
  );
};
