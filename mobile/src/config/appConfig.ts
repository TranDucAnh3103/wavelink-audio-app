/**
 * Cấu hình điểm truy cập và các thiết lập mặc định của WaveLink Mobile Shell
 */

export const APP_CONFIG = {
  // Điểm cuối Web App chính thức đã triển khai
  WEB_URL: 'https://wavelink-audio-app.zhost.education/',
  DEV_WEB_URL: 'https://wavelink-audio-app.zhost.education/',
  PROD_WEB_URL: 'https://wavelink-audio-app.zhost.education/',

  // Cờ debug / dev
  IS_DEV: __DEV__,

  // Cấu hình Bong bóng nổi
  BUBBLE_SIZE_DP: 64,
  AUTO_RESTORE_ON_CLICK: true,

  // Fallback sang PiP nếu chưa có quyền Draw Over Other Apps
  ENABLE_PIP_FALLBACK: true,
};

export function getActiveWebUrl(): string {
  return APP_CONFIG.WEB_URL;
}
