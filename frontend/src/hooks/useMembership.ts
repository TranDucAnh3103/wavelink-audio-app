import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { PaymentInfo, MembershipPackage } from '@/types';
import { readSwrCache, writeSwrCache } from '@/lib/swrCache';
import { useIsHydrated } from '@/hooks/useDelayedFallback';

export function useMembershipPackages() {
  const { user } = useAuthStore();
  const hydrated = useIsHydrated();
  return useQuery({
    queryKey: ['membership-packages', user?.id, user?.role, user?.membership],
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const data = await api.membership.getPackages(isLive);
      if (Array.isArray(data) && data.length > 0) {
        writeSwrCache('membership-packages', data);
      }
      return data;
    },
    placeholderData: (prev) => {
      if (prev !== undefined) return prev;
      if (!hydrated) return undefined;
      return readSwrCache<MembershipPackage[]>('membership-packages')?.data;
    },
  });
}

export function usePaymentInfo() {
  const hydrated = useIsHydrated();
  return useQuery({
    queryKey: ['payment-info'],
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const data = await api.membership.getPaymentInfo(isLive);
      if (data) {
        writeSwrCache('payment-info', data);
      }
      return data;
    },
    placeholderData: (prev) => {
      if (prev !== undefined) return prev;
      if (!hydrated) return undefined;
      return readSwrCache<PaymentInfo>('payment-info')?.data;
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

export function useCreateMembershipOrder() {
  return useMutation({
    mutationFn: (packageId: string) => {
      const { isLive } = useAuthStore.getState();
      return api.membership.createOrder(packageId, isLive);
    },
  });
}

export function useCancelMembershipOrder() {
  return useMutation({
    mutationFn: (orderCode: string) => {
      const { isLive } = useAuthStore.getState();
      return api.membership.cancelOrder(orderCode, isLive);
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
      queryClient.invalidateQueries({ queryKey: ['membership-packages'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['import-quota'] });
      queryClient.invalidateQueries({ queryKey: ['audios'] });
      queryClient.invalidateQueries({ queryKey: ['audio'] });
    },
  });
}
