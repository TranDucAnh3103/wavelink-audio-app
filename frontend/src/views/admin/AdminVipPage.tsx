'use client';

import React, { useState, useEffect } from 'react';
import { Crown, Landmark, Tag, RotateCcw, Save, Info } from 'lucide-react';
import { AdminTabs } from './AdminTabs';
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
import { formatVND } from '@/lib/utils';
import { AdminVipSkeleton } from '@/components/common/Skeletons';

export const AdminVipPage: React.FC = () => {
  const { data: serverPackages = [], isLoading: pkgsLoading } = useMembershipPackages();
  const { data: serverPaymentInfo, isLoading: payLoading } = usePaymentInfo();

  const updatePaymentInfoMutation = useUpdatePaymentInfo();
  const updatePackagesMutation = useUpdatePackages();
  const resetPackagesMutation = useResetPackages();

  const [bankName, setBankName] = useState('MB Bank (Quân Đội)');
  const [accountNumber, setAccountNumber] = useState('0987654321');
  const [accountName, setAccountName] = useState('COMIC AUDIO HUB');
  const [notePrefix, setNotePrefix] = useState('VIP');

  const [packages, setPackages] = useState<MembershipPackage[]>([]);

  useEffect(() => {
    if (serverPaymentInfo) {
      setBankName(serverPaymentInfo.bankName || 'MB Bank (Quân Đội)');
      setAccountNumber(serverPaymentInfo.accountNumber || '0987654321');
      setAccountName(serverPaymentInfo.accountName || 'COMIC AUDIO HUB');
      setNotePrefix(serverPaymentInfo.notePrefix || 'VIP');
    }
  }, [serverPaymentInfo]);

  useEffect(() => {
    if (serverPackages && serverPackages.length > 0) {
      setPackages(JSON.parse(JSON.stringify(serverPackages)));
    }
  }, [serverPackages]);

  const showSkeletonFallback = useDelayedFallback(
    (pkgsLoading || payLoading) && serverPackages.length === 0,
    180
  );

  const handleSavePaymentInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) {
      toast.error('Vui lòng điền đầy đủ tên ngân hàng, STK và tên chủ tài khoản!');
      return;
    }

    try {
      toast.info('Đang lưu thông tin chuyển khoản...');
      await updatePaymentInfoMutation.mutateAsync({
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim().toUpperCase(),
        notePrefix: notePrefix.trim().toUpperCase() || 'VIP',
      });
      toast.success('Đã cập nhật thông tin tài khoản ngân hàng & VietQR!');
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Lỗi lưu thông tin ngân hàng');
    }
  };

  const handlePackageChange = (index: number, field: keyof MembershipPackage, val: unknown) => {
    setPackages((prev) =>
      prev.map((pkg, idx) => (idx === index ? { ...pkg, [field]: val } : pkg))
    );
  };

  const handlePriceChange = (index: number, val: number) => {
    setPackages((prev) =>
      prev.map((pkg, idx) =>
        idx === index ? { ...pkg, priceVND: val, amount: val } : pkg
      )
    );
  };

  const handlePerkChange = (pkgIndex: number, perkIndex: number, val: string) => {
    const updated = [...packages];
    const perks = [...(updated[pkgIndex].perks || [])];
    perks[perkIndex] = val;
    updated[pkgIndex] = { ...updated[pkgIndex], perks };
    setPackages(updated);
  };

  const handleAddPerk = (pkgIndex: number) => {
    const updated = [...packages];
    const perks = [...(updated[pkgIndex].perks || []), 'Đặc quyền mới'];
    updated[pkgIndex] = { ...updated[pkgIndex], perks };
    setPackages(updated);
  };

  const handleRemovePerk = (pkgIndex: number, perkIndex: number) => {
    const updated = [...packages];
    const perks = (updated[pkgIndex].perks || []).filter((_, idx) => idx !== perkIndex);
    updated[pkgIndex] = { ...updated[pkgIndex], perks };
    setPackages(updated);
  };

  const handleSavePackages = async () => {
    try {
      toast.info('Đang lưu bảng giá và gói VIP...');
      const sanitized = packages.map(({ isLocked: _l, isCurrent: _c, canUpgrade: _u, ...rest }) => rest);
      await updatePackagesMutation.mutateAsync(sanitized);
      toast.success('Đã lưu cấu hình gói VIP thành công!');
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Lỗi lưu gói VIP');
    }
  };

  const handleResetPackages = async () => {
    if (!window.confirm('Bạn có chắc muốn khôi phục danh sách gói VIP về mặc định của hệ thống?'))
      return;
    try {
      toast.info('Đang khôi phục mặc định...');
      await resetPackagesMutation.mutateAsync();
      toast.success('Đã khôi phục gói VIP về mặc định!');
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Lỗi khôi phục');
    }
  };

  if (showSkeletonFallback) {
    return <AdminVipSkeleton />;
  }

  const demoQrUrl = `https://img.vietqr.io/image/970422-${accountNumber.trim()}-compact2.png?amount=49000&addInfo=${encodeURIComponent(
    `${notePrefix.trim()}-DEMO-12345`
  )}&accountName=${encodeURIComponent(accountName.trim())}`;

  return (
    <div className="flex flex-col w-full pb-36 md:pb-28 fade-in-comic">
      <AdminTabs activeTab="vip" />

      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 flex flex-col gap-5">
        {/* Header Banner */}
        <div className="card-comic p-4 md:p-5 bg-[#8338EC] text-white flex flex-col gap-1 border-2 border-[#111113] shadow-comic">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl border-2 border-[#111113] bg-[#FFE600] text-[#111113] flex items-center justify-center shadow-comic-sm shrink-0">
                <Crown className="w-5 h-5" strokeWidth={2.5} />
              </div>
              <h2 className="font-comic font-extrabold text-base md:text-lg uppercase tracking-tight text-white">
                Quản Trị Gói VIP & Thanh Toán VietQR
              </h2>
            </div>
            <span className="badge-comic badge-comic-yellow text-[9px] font-black">
              ADMIN VIP PANEL
            </span>
          </div>
          <p className="text-xs font-semibold text-white/90 mt-0.5">
            Tùy chỉnh thông tin người nhận chuyển tiền (ngân hàng, STK, chủ TK) và điều chỉnh giá tiền, số ngày hiệu lực của các gói hội viên.
          </p>
        </div>

        {/* 1. Bank Info Card */}
        <div className="card-comic p-4 md:p-5 flex flex-col gap-3.5">
          <div className="flex items-center justify-between border-b-2 border-[var(--border-ink)] pb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Landmark className="w-5 h-5 text-[#3A86FF]" strokeWidth={2.5} />
              <h3 className="font-extrabold text-sm uppercase text-[var(--ink-primary)]">
                Thông Tin Tài Khoản Nhận Chuyển Tiền (VietQR)
              </h3>
            </div>
            <span className="badge-comic badge-comic-teal text-[8px] font-bold">
              CÓ LƯU ENV & DATABASE
            </span>
          </div>

          <form onSubmit={handleSavePaymentInfo} className="flex flex-col gap-3.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-[var(--ink-primary)]" htmlFor="admin-bank-name">
                  Tên Ngân Hàng:
                </label>
                <input
                  id="admin-bank-name"
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Ví dụ: MB Bank (Quân Đội)"
                  className="input-comic text-xs font-bold w-full"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-[var(--ink-primary)]" htmlFor="admin-acc-num">
                  Số Tài Khoản (STK):
                </label>
                <input
                  id="admin-acc-num"
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Ví dụ: 0987654321"
                  className="input-comic text-xs font-mono font-bold w-full"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-[var(--ink-primary)]" htmlFor="admin-acc-name">
                  Tên Chủ Tài Khoản:
                </label>
                <input
                  id="admin-acc-name"
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Ví dụ: COMIC AUDIO HUB"
                  className="input-comic text-xs font-bold uppercase w-full"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  className="text-xs font-bold text-[var(--ink-primary)]"
                  htmlFor="admin-note-prefix"
                >
                  Tiền Tố Nội Dung Chuyển Khoản:
                </label>
                <input
                  id="admin-note-prefix"
                  type="text"
                  value={notePrefix}
                  onChange={(e) => setNotePrefix(e.target.value)}
                  placeholder="Mặc định: VIP"
                  className="input-comic text-xs font-mono font-bold uppercase w-full"
                />
              </div>
            </div>

            <div className="card-comic-sm p-3 bg-[var(--surface-accent-soft)] flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg border border-[var(--border-ink)] bg-white p-1 shrink-0 overflow-hidden">
                <img src={demoQrUrl} alt="VietQR Demo" className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-col min-w-0 flex-1 text-[11px] font-semibold text-[var(--ink-secondary)]">
                <span className="font-extrabold text-[var(--ink-primary)]">
                  Mẫu VietQR sẽ hiển thị cho độc giả:
                </span>
                <span className="truncate">
                  Ngân hàng: <strong>{bankName}</strong>
                </span>
                <span className="truncate font-mono">
                  STK: <strong>{accountNumber}</strong> · Chủ TK: <strong>{accountName}</strong>
                </span>
                <span className="truncate font-mono text-[var(--ink-muted)]">
                  Nội dung mẫu: {notePrefix}-USERID-XXXXXX
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={updatePaymentInfoMutation.isPending}
                className="btn-comic btn-comic-teal text-xs py-2 px-4 font-black shadow-comic-sm"
              >
                {updatePaymentInfoMutation.isPending ? 'Đang lưu...' : 'Lưu Thông Tin Ngân Hàng'}
              </button>
            </div>
          </form>
        </div>

        {/* 2. VIP Packages Configuration */}
        <div className="card-comic p-4 md:p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b-2 border-[var(--border-ink)] pb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-[#D97706]" strokeWidth={2.5} />
              <h3 className="font-extrabold text-sm uppercase text-[var(--ink-primary)]">
                Bảng Giá & Thông Tin Gói Hội Viên ({packages.length} gói)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetPackages}
                disabled={resetPackagesMutation.isPending}
                className="btn-comic text-[11px] py-1.5 px-3"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Khôi phục mặc định</span>
              </button>
              <button
                type="button"
                onClick={handleSavePackages}
                disabled={updatePackagesMutation.isPending}
                className="btn-comic btn-comic-yellow text-xs py-1.5 px-3 font-black"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Lưu Bảng Giá Gói</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {packages.map((pkg, pIdx) => (
              <div
                key={pkg.id}
                className="card-comic-sm p-4 bg-[var(--surface-elevated)] flex flex-col gap-3 shadow-comic-sm"
              >
                <div className="flex items-center justify-between border-b border-[var(--border-ink)]/25 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="badge-comic badge-comic-yellow text-[10px] font-black">
                      {pkg.id}
                    </span>
                    <span className="font-extrabold text-sm text-[var(--ink-primary)]">
                      {pkg.name}
                    </span>
                  </div>
                  <span className="font-mono font-black text-sm text-[#E63946]">
                    {formatVND(pkg.priceVND || pkg.amount || 0)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[var(--ink-secondary)]">
                      Tên gói hiển thị:
                    </label>
                    <input
                      type="text"
                      value={pkg.name}
                      onChange={(e) => handlePackageChange(pIdx, 'name', e.target.value)}
                      className="input-comic text-xs font-bold"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[var(--ink-secondary)]">
                      Giá bán thực tế (VNĐ):
                    </label>
                    <input
                      type="number"
                      value={pkg.priceVND || pkg.amount || 0}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value) || 0);
                        handlePriceChange(pIdx, val);
                      }}
                      className="input-comic text-xs font-mono font-bold"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[var(--ink-secondary)]">
                      Thời hạn hiệu lực (Ngày):
                    </label>
                    <input
                      type="number"
                      value={pkg.durationDays}
                      onChange={(e) =>
                        handlePackageChange(pIdx, 'durationDays', Number(e.target.value))
                      }
                      className="input-comic text-xs font-mono font-bold"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[var(--ink-secondary)]">
                      Giá gốc gạch ngang (VNĐ):
                    </label>
                    <input
                      type="number"
                      value={pkg.originalCost || 0}
                      onChange={(e) =>
                        handlePackageChange(pIdx, 'originalCost', Number(e.target.value))
                      }
                      className="input-comic text-xs font-mono font-bold"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[var(--ink-secondary)]">
                      Huy hiệu ưu đãi / Giảm giá:
                    </label>
                    <input
                      type="text"
                      value={pkg.discount || ''}
                      onChange={(e) => handlePackageChange(pIdx, 'discount', e.target.value)}
                      placeholder="Ví dụ: Tiết kiệm 27% (Khuyên dùng)"
                      className="input-comic text-xs font-bold"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[var(--ink-secondary)]">Mô tả ngắn gọn:</label>
                    <input
                      type="text"
                      value={pkg.description}
                      onChange={(e) => handlePackageChange(pIdx, 'description', e.target.value)}
                      className="input-comic text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border-ink)]/20">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-[var(--ink-secondary)] uppercase">
                      Danh Sách Đặc Quyền ({pkg.perks?.length || 0})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddPerk(pIdx)}
                      className="btn-comic text-[10px] py-1 px-2.5"
                    >
                      + Thêm đặc quyền
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {(pkg.perks || []).map((perk, perkIdx) => (
                      <div key={perkIdx} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={perk}
                          onChange={(e) => handlePerkChange(pIdx, perkIdx, e.target.value)}
                          className="input-comic text-[11px] py-1 px-2 flex-1 font-semibold"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePerk(pIdx, perkIdx)}
                          className="w-7 h-7 rounded-lg border border-[var(--border-ink)] bg-[var(--surface-card)] flex items-center justify-center text-[#E63946] hover:bg-[#FFF1F2] dark:hover:bg-[#2F161A] text-xs font-black shrink-0 cursor-pointer"
                          title="Xóa"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2 border-t border-[var(--border-ink)]/25">
            <button
              type="button"
              onClick={handleSavePackages}
              disabled={updatePackagesMutation.isPending}
              className="btn-comic btn-comic-yellow text-sm py-2.5 px-5 font-black shadow-comic-sm"
            >
              {updatePackagesMutation.isPending
                ? 'Đang lưu...'
                : 'Lưu Toàn Bộ Cấu Hình Gói VIP'}
            </button>
          </div>
        </div>

        {/* 3. Policy Box */}
        <div className="card-comic p-4 bg-[var(--surface-accent-soft)] flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-[var(--ink-primary)]" strokeWidth={2.5} />
            <h4 className="font-extrabold text-xs uppercase text-[var(--ink-primary)]">
              Cơ Chế Giới Hạn Gói & Nâng Cấp Cộng Dồn Thời Gian VIP
            </h4>
          </div>
          <ul className="text-xs font-medium text-[var(--ink-secondary)] list-disc list-inside space-y-1">
            <li>
              <strong className="text-[var(--ink-primary)]">Khóa gói đã đăng ký:</strong> Khi một
              người dùng đăng ký Gói 1 Tháng, gói đó sẽ bị khóa lại đối với tài khoản đó để ngăn mua lặp lại cùng cấp.
            </li>
            <li>
              <strong className="text-[var(--ink-primary)]">Cho phép nâng cấp:</strong> Người dùng
              có thể nâng cấp lên các gói cao hơn (Gói 3 Tháng hoặc Gói 1 Năm).
            </li>
            <li>
              <strong className="text-[var(--ink-primary)]">Cộng dồn thời hạn:</strong> Khi nâng cấp
              gói cao hơn, toàn bộ số ngày còn lại của gói cũ sẽ được cộng dồn với thời hạn của gói mới.
            </li>
            <li>
              <strong className="text-[var(--ink-primary)]">Tự động khóa gói cũ:</strong> Sau khi
              nâng cấp, tất cả các gói bằng hoặc thấp hơn gói mới đều tự động khóa lại đối với tài khoản đó.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
