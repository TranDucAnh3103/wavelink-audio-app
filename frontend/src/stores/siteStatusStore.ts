import { create } from 'zustand';

interface SiteStatusState {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  allowUserImport: boolean;
  allowGuestChat: boolean;
  setMaintenance: (active: boolean, message?: string) => void;
  setSiteStatus: (status: {
    maintenanceMode?: boolean;
    maintenanceMessage?: string;
    allowUserImport?: boolean;
    allowGuestChat?: boolean;
  }) => void;
}

export const useSiteStatusStore = create<SiteStatusState>((set) => ({
  maintenanceMode: false,
  maintenanceMessage: '',
  allowUserImport: true,
  allowGuestChat: true,
  setMaintenance: (active, message) =>
    set((state) => ({
      maintenanceMode: active,
      maintenanceMessage: active
        ? message || state.maintenanceMessage || 'Hệ thống đang bảo trì. Vui lòng quay lại sau.'
        : '',
    })),
  setSiteStatus: (status) =>
    set((state) => ({
      maintenanceMode: status.maintenanceMode ?? state.maintenanceMode,
      maintenanceMessage: status.maintenanceMessage ?? state.maintenanceMessage,
      allowUserImport: status.allowUserImport ?? state.allowUserImport,
      allowGuestChat: status.allowGuestChat ?? state.allowGuestChat,
    })),
}));
