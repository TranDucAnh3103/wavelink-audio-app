// ==============================================================================
// WaveLink Audio App - Runtime Environment Configuration (Hosting Production)
// ------------------------------------------------------------------------------
// File này được tải độc lập tại Runtime trên Web Hosting zHost.
// Khi Cloudflare Quick Tunnel thay đổi URL trên Home Server, bạn chỉ cần sửa URL
// ở dòng bên dưới mà KHÔNG CẦN BUILD LẠI TOÀN BỘ MÃ NGUỒN FRONTEND.
// ==============================================================================
window.__ENV__ = {
  // Đường dẫn Cloudflare Tunnel trỏ về Backend VPS (MySQL Production)
  VITE_API_BASE_URL: "https://perth-obj-blackberry-favor.trycloudflare.com/api/v1",
  // Đường dẫn Stream Proxy riêng (để trống nếu dùng cùng origin với VITE_API_BASE_URL)
  STREAM_BASE_URL: "",
  // Chế độ phát mặc định: "stream" (Direct Audio Stream Proxy + HTML5 <audio>) hoặc "youtube" (IFrame fallback)
  AUDIO_ENGINE: "stream",
  APP_ENV: "production"
};
