'use client';

import React, { useState, useEffect } from 'react';
import { Info } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { User } from '@/types';
import { AdminTabs } from './AdminTabs';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { api } from '@/services/api';
import { AdminTableSkeleton } from '@/components/common/Skeletons';
import { Pagination } from '@/components/ui/Pagination';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';

export const AdminAccountsPage: React.FC = () => {
  const { isLive } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = DEFAULT_PAGE_SIZE;
  const totalUserPages = Math.max(1, Math.ceil(users.length / pageSize));
  const safeUserPage = Math.min(Math.max(1, currentPage), totalUserPages);

  useEffect(() => {
    if (currentPage > totalUserPages) {
      setCurrentPage(totalUserPages);
    }
  }, [currentPage, totalUserPages]);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<'USER' | 'VIP' | 'ADMIN'>('USER');
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await api.user.getUsers(isLive);
      setUsers(data);
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  const showSkeletonFallback = useDelayedFallback(isLoading && users.length === 0, 180);

  const openRoleModal = (u: User) => {
    setSelectedUser(u);
    setNewRole(u.role === 'ADMIN' ? 'ADMIN' : u.role === 'VIP' ? 'VIP' : 'USER');
  };

  const handleSaveRole = async () => {
    if (!selectedUser) return false;
    const newMembership = newRole === 'VIP' || newRole === 'ADMIN' ? 'VIP' : 'FREE';
    try {
      toast.info('Đang cập nhật quyền...');
      await api.user.updateUserRole(selectedUser.id, newRole, newMembership, isLive);
      toast.success('Đã lưu phân quyền và đồng bộ hội viên thành công!');
      setSelectedUser(null);
      loadUsers();
      return true;
    } catch {
      toast.error('Lỗi cập nhật quyền');
      return false;
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUserId) return;
    try {
      toast.info('Đang xóa tài khoản...');
      await api.user.deleteUser(deletingUserId, isLive);
      toast.success('Đã xóa tài khoản');
      setDeletingUserId(null);
      loadUsers();
    } catch {
      toast.error('Lỗi xóa tài khoản');
    }
  };

  return (
    <div className="flex flex-col w-full pb-36 md:pb-28 fade-in-comic">
      <AdminTabs activeTab="accounts" />

      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
            Người Dùng & Phân Quyền RBAC
          </h2>
          <span className="badge-comic badge-comic-purple text-[9px] font-black">ADMIN ACCESS</span>
        </div>

        {showSkeletonFallback ? (
          <AdminTableSkeleton rows={4} />
        ) : users.length === 0 ? (
          <div className="card-comic p-6 text-center text-xs font-bold text-[var(--ink-secondary)]">
            Chưa có tài khoản người dùng nào trên hệ thống.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {users
                .slice((safeUserPage - 1) * pageSize, safeUserPage * pageSize)
                .map((u) => {
                  const roleColor =
                    u.role === 'ADMIN'
                      ? 'badge-comic-red'
                      : u.role === 'VIP'
                        ? 'badge-comic-purple'
                        : u.isGuest
                          ? 'badge-comic-yellow'
                          : 'badge-comic-white';

                  return (
                    <div
                      key={u.id}
                      className="card-comic-sm p-3.5 bg-[var(--surface-card)] flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl border-2 border-[#111113] ${
                            u.role === 'ADMIN'
                              ? 'bg-[#E63946] text-white'
                              : u.role === 'VIP'
                                ? 'bg-[#8338EC] text-white'
                                : 'bg-[#FFE600] text-[#111113]'
                          } flex items-center justify-center font-bold text-xs shrink-0 shadow-comic-sm`}
                        >
                          {u.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate leading-tight">
                              {u.username}
                            </span>
                            <span className={`badge-comic ${roleColor} text-[8px] py-0 px-1 font-black`}>
                              {u.role || 'USER'}
                            </span>
                          </div>
                          <span className="text-[11px] font-semibold text-[var(--ink-muted)] truncate mt-0.5">
                            {u.email || (u.isGuest ? 'Khách vãng lai' : 'Chưa có email')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openRoleModal(u)}
                          className="btn-comic text-[11px] py-1 px-2.5"
                        >
                          Quyền
                        </button>
                        {u.role !== 'ADMIN' && (
                          <button
                            type="button"
                            onClick={() => setDeletingUserId(u.id)}
                            className="btn-comic btn-comic-red text-[11px] py-1 px-2.5"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            <Pagination
              currentPage={safeUserPage}
              totalPages={totalUserPages}
              totalItems={users.length}
              pageSize={pageSize}
              onPageChange={(p) => {
                setCurrentPage(p);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        )}
      </div>

      {/* Change Role Modal */}
      <Modal
        isOpen={Boolean(selectedUser)}
        onClose={() => setSelectedUser(null)}
        title={`PHÂN QUYỀN: ${selectedUser?.username}`}
        confirmText="Lưu Phân Quyền"
        onConfirm={handleSaveRole}
        size="sm"
      >
        <div className="flex flex-col gap-2.5">
          <p className="text-[11px] font-semibold text-[var(--ink-secondary)] leading-tight">
            Chọn vai trò hệ thống (Hạng hội viên & thời hạn VIP 30 ngày sẽ tự động đồng bộ theo Role):
          </p>
          <div className="flex flex-col gap-1">
            <label
              className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]"
              htmlFor="user-role-select"
            >
              Vai trò hệ thống (Role)
            </label>
            <select
              id="user-role-select"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'USER' | 'VIP' | 'ADMIN')}
              className="input-comic text-xs font-bold py-1.5"
            >
              <option value="USER">USER (Người dùng tiêu chuẩn - Hạng FREE)</option>
              <option value="VIP">VIP (Thành viên cao cấp - Cấp hạn 30 ngày)</option>
              <option value="ADMIN">ADMIN (Quản trị viên tối cao)</option>
            </select>
          </div>
          <div className="card-comic-sm p-2.5 bg-[var(--surface-accent-soft)] text-[10px] font-semibold text-[var(--ink-secondary)] flex items-start gap-1.5 leading-snug">
            <Info className="w-3.5 h-3.5 text-[var(--ink-primary)] shrink-0 mt-0.5" />
            <span>
              Khi chọn <strong>VIP</strong>, hệ thống tự động đồng bộ Hạng <strong>VIP</strong> và kích hoạt hạn 30 ngày. Chọn <strong>USER</strong>, tài khoản về hạng <strong>FREE</strong>.
            </span>
          </div>
        </div>
      </Modal>

      {/* Delete User Modal */}
      <Modal
        isOpen={Boolean(deletingUserId)}
        onClose={() => setDeletingUserId(null)}
        title="XÓA TÀI KHOẢN NÀY?"
        isDanger
        confirmText="Xóa Vĩnh Viễn"
        onConfirm={handleDeleteUser}
        size="sm"
      >
        <p className="text-xs font-semibold text-[var(--ink-secondary)] leading-snug">
          Bạn có chắc chắn muốn xóa tài khoản này? Toàn bộ lịch sử nghe và danh sách yêu thích của người này sẽ bị xóa sạch.
        </p>
      </Modal>
    </div>
  );
};
