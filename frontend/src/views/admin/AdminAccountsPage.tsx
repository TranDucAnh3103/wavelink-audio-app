'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { User } from '@/types';
import { AdminTabs } from './AdminTabs';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { api } from '@/services/api';
import { LoadingState } from '@/components/common/LoadingState';
import { AdminTableSkeleton } from '@/components/common/Skeletons';
import { Pagination } from '@/components/ui/Pagination';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';

export const AdminAccountsPage: React.FC = () => {
  const { isLive } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Pagination (12 users per page by default, configurable via env)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = DEFAULT_PAGE_SIZE;
  const totalUserPages = Math.max(1, Math.ceil(users.length / pageSize));
  const safeUserPage = Math.min(Math.max(1, currentPage), totalUserPages);

  useEffect(() => {
    if (currentPage > totalUserPages) {
      setCurrentPage(totalUserPages);
    }
  }, [currentPage, totalUserPages]);

  // Role Modal
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<'USER' | 'VIP' | 'ADMIN'>('USER');

  // Delete Modal
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
  }, [isLive]);

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
    <div className="flex flex-col w-full pb-36 fade-in-comic">
      <AdminTabs activeTab="accounts" />

      <div className="px-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold text-xs uppercase text-black">Người Dùng & Phân Quyền RBAC</h2>
          <span className="badge-comic badge-comic-purple text-[9px] font-black">ADMIN ACCESS</span>
        </div>

        {isLoading ? (
          <AdminTableSkeleton rows={4} />
        ) : users.length === 0 ? (
          <div className="card-comic p-6 text-center text-xs font-bold text-gray-600 bg-white">
            Chưa có tài khoản người dùng nào trên hệ thống.
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2.5">
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
                    <div key={u.id} className="card-comic-sm p-3 bg-white flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-full border-2 border-black ${
                            u.role === 'ADMIN'
                              ? 'bg-[#E63946] text-white'
                              : u.role === 'VIP'
                              ? 'bg-[#8338EC] text-white'
                              : 'bg-[#FFE600] text-black'
                          } flex items-center justify-center font-bold text-xs shrink-0 shadow-comic-sm`}
                        >
                          {u.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-xs text-black truncate leading-tight">
                              {u.username}
                            </span>
                            <span className={`badge-comic ${roleColor} text-[8px] py-0 px-1 font-black`}>
                              {u.role || 'USER'}
                            </span>
                          </div>
                          <span className="text-[11px] font-semibold text-gray-500 truncate mt-0.5">
                            {u.email || (u.isGuest ? 'Khách vãng lai' : 'Chưa có email')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => openRoleModal(u)}
                          className="btn-comic text-[11px] py-1 px-2 bg-gray-100"
                        >
                          Quyền
                        </button>
                        {u.role !== 'ADMIN' && (
                          <button
                            onClick={() => setDeletingUserId(u.id)}
                            className="btn-comic btn-comic-red text-[11px] py-1 px-2"
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
      >
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-gray-700 leading-tight">
            Chọn vai trò hệ thống (Hạng hội viên & thời hạn VIP 30 ngày sẽ tự động đồng bộ theo Role):
          </p>
          <div className="flex flex-col gap-0.5">
            <label className="font-extrabold text-[11px] uppercase text-black" htmlFor="user-role-select">
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
          <div className="card-comic-sm p-1.5 bg-[#FEF9C3] text-[10px] font-semibold text-gray-700 border border-black leading-tight">
            <i className="ri-information-line text-black font-bold" /> Khi chọn <strong>VIP</strong>, hệ thống tự động đồng bộ Hạng <strong>VIP</strong> và kích hoạt hạn 30 ngày. Chọn <strong>USER</strong>, tài khoản về hạng <strong>FREE</strong>.
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
      >
        <p className="text-xs font-semibold text-gray-800 leading-snug">
          Bạn có chắc chắn muốn xóa tài khoản này? Toàn bộ lịch sử nghe và danh sách yêu thích của người này sẽ bị xóa sạch.
        </p>
      </Modal>
    </div>
  );
};

