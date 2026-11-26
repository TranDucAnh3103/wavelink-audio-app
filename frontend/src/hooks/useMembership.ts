import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { PaymentInfo, MembershipPackage } from '@/types';

export function useMembershipPackages() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['membership-packages', user?.id, user?.role, user?.membership],
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const data = await api.membership.getPackages(isLive);
      return data;
    },
  });
}

export function usePaymentInfo() {
  return useQuery({
    queryKey: ['payment-info'],
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const data = await api.membership.getPaymentInfo(isLive);
      return data;
    },
  });
}

export function useUpdatePaymentInfo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (info: PaymentInfo) => {
      const { isLive } = useAuthStore.getState();
      return api.membership.updatePaymentInfo(info, isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-info'] });
      queryClient.invalidateQueries({ queryKey: ['membership-packages'] });
    },
  });
}

export function useUpdatePackages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (packages: MembershipPackage[]) => {
      const { isLive } = useAuthStore.getState();
      return api.membership.updatePackages(packages, isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membership-packages'] });
    },
  });
}

export function useResetPackages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      const { isLive } = useAuthStore.getState();
      return api.membership.resetPackages(isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membership-packages'] });
    },
  });
}

export function useMyMembership() {
  const { user } = useAuthStore();
  const isAuthenticatedMember = Boolean(user && !user.isGuest && user.role !== 'GUEST');
  return useQuery({
    queryKey: ['my-membership', user?.id],
    queryFn: () => {
      const { isLive } = useAuthStore.getState();
      return api.membership.getMyMembership(isLive);
    },
    enabled: isAuthenticatedMember,
  });
}

export function useMembershipOrders() {
  const { user } = useAuthStore();
  const isAuthenticatedMember = Boolean(user && !user.isGuest && user.role !== 'GUEST');
  return useQuery({
    queryKey: ['membership-orders', user?.id],
    queryFn: () => {
      const { isLive } = useAuthStore.getState();
      return api.membership.getMyOrders(isLive);
    },
    enabled: isAuthenticatedMember,
    staleTime: 15000,
  });
}

export function useCreateMembershipOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (packageId: string) => {
      const { isLive } = useAuthStore.getState();
      return api.membership.createOrder(packageId, isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-membership'] });
      queryClient.invalidateQueries({ queryKey: ['membership-orders'] });
    },
  });
}

export function useCancelMembershipOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderCode: string) => {
      const { isLive } = useAuthStore.getState();
      return api.membership.cancelOrder(orderCode, isLive);
    },
    onSuccess: async () => {
      await useAuthStore.getState().refreshUser();
      queryClient.invalidateQueries({ queryKey: ['my-membership'] });
      queryClient.invalidateQueries({ queryKey: ['membership-orders'] });
      queryClient.invalidateQueries({ queryKey: ['membership-packages'] });
    },
  });
}

export function useSimulatePayment() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuthStore();

  return useMutation({
    mutationFn: ({ orderCode, status }: { orderCode: string; status: 'SUCCESS' | 'FAILED' }) => {
      const { isLive } = useAuthStore.getState();
      return api.membership.simulatePayment(orderCode, status, isLive);
    },
    onSuccess: async () => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['my-membership'] });
      queryClient.invalidateQueries({ queryKey: ['membership-orders'] });
      queryClient.invalidateQueries({ queryKey: ['membership-packages'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['import-quota'] });
      queryClient.invalidateQueries({ queryKey: ['audios'] });
      queryClient.invalidateQueries({ queryKey: ['audio'] });
    },
  });
}
