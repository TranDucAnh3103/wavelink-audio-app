// ==============================================================================
// WaveLink Audio App - Runtime Environment Configuration (Hosting Production)
// ------------------------------------------------------------------------------
// File này được tải độc lập tại Runtime trên Web Hosting zHost.
// Khi Cloudflare Quick Tunnel thay đổi URL trên Home Server, bạn chỉ cần sửa URL
// ở dòng bên dưới mà KHÔNG CẦN BUILD LẠI TOÀN BỘ MÃ NGUỒN FRONTEND.
// ==============================================================================
window.__ENV__ = {
  // Đường dẫn Cloudflare Quick Tunnel trỏ về Home Server (MySQL Production)
  VITE_API_BASE_URL: "https://perth-obj-blackberry-favor.trycloudflare.com/api/v1",
  APP_ENV: "production"
};
