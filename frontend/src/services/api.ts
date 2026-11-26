import { localDb } from './localDb';
import { authService } from './authService';
import { audioService } from './audioService';
import { episodeService } from './episodeService';
import { categoryService } from './categoryService';
import { tagService } from './tagService';
import { statsService } from './statsService';
import { progressService } from './progressService';
import { historyService } from './historyService';
import { notificationService } from './notificationService';
import { membershipService } from './membershipService';
import { userService } from './userService';
import { guestSessionService } from './guestSessionService';
import { communityService } from './communityService';
import { adminService } from './adminService';

function purgeLegacyLocalStorageDb(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const legacyKeys = [
      'audio_library_db',
      'wavelink_community_messages',
      'wavelink_local_notifications',
      'vip_payment_info',
      'vip_packages',
      'active_membership_order',
      'wavelink_admin_orders',
    ];
    legacyKeys.forEach((k) => localStorage.removeItem(k));

    if (typeof localStorage.length === 'number' && typeof localStorage.key === 'function') {
      const swrKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('wavelink_cache_swr:')) {
          swrKeys.push(key);
        }
      }
      swrKeys.forEach((k) => localStorage.removeItem(k));
    }
  } catch {
    // Ignore storage errors
  }
}

export const api = {
  localDb,
  auth: authService,
  audio: audioService,
  episode: episodeService,
  category: categoryService,
  tag: tagService,
  stats: statsService,
  progress: progressService,
  history: historyService,
  notification: notificationService,
  membership: membershipService,
  user: userService,
  guestSession: guestSessionService,
  community: communityService,
  admin: adminService,

  async init(): Promise<boolean> {
    purgeLegacyLocalStorageDb();
    await localDb.init();
    progressService.initOfflineSyncListener();
    const isLive = await authService.pingHealth();
    return isLive;
  },
};
