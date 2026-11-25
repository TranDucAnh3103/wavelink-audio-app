# 01. Phân tích hiện trạng dự án so với mindset mới

## 1. Hạ tầng thực tế
```text
[Người dùng] ──► FE tĩnh (zHost/DirectAdmin, domain wavelink-audio-app.zhost.education)
                    │  gọi thẳng API (NEXT_PUBLIC_API_BASE_URL)
                    ▼
              Cloudflare Tunnel (kế hoạch tại docs/06)
                    ▼
        VPS Ubuntu: Docker compose (wavelink-backend :8080 + MySQL 8)
                    ▼
        YouTube / googlevideo CDN (IP VPS là IP datacenter)
```
- Preview/SIT: Vercel + Render + Aiven. **Không dùng cho stream** vì IP Render bị YouTube chặn nhiều hơn.
- Mobile: React Native 0.74 chỉ có `react-native-webview` và module Android tự viết `MediaPlayback.ts` (notification MediaStyle). Tức là app mobile vẫn phát bằng iframe trong WebView.

## 2. Những gì đã có và dùng lại được
| Thành phần | Vị trí | Dùng cho |
|---|---|---|
| Tập ảo | `backend/core/domain/types.go` (`Episode.StartSeconds/EndSeconds`) | Chia tập trên một luồng duy nhất. Không cần đổi schema. |
| Chia tập | `core/logic/episode_splitter.go` | Giữ nguyên |
| Parse YouTube | `core/logic/youtube_parser.go`, `infra/external/youtube.go` | Lấy metadata. Cần bổ sung trích `streamingData`. |
| Phân quyền VIP/free | `core/logic/policy_engine.go`, `FreeEpisodesCount` | Cổng cấp quyền stream |
| Auth bằng query `?token=` | `middleware/auth.go` `SessionMiddleware` | Gợi ý cho `<audio>` (không gửi được header). Xem 02 mục 4. |
| Tiến độ nghe | `modules/progress`, `listening_progress` | Giữ nguyên |
| CORS theo biến môi trường | `ALLOWED_ORIGINS` | Thêm domain zHost |
| Dockerfile Go đa tầng | `backend/Dockerfile` | Thêm `yt-dlp` |

## 3. Những gì vướng (phải sửa)
| # | Vấn đề | Hậu quả nếu không sửa | Cách sửa |
|---|---|---|---|
| 1 | `cmd/api/main.go`: `WriteTimeout: 20s`, `ReadTimeout: 15s` | Luồng audio bị cắt sau 20s | Xoá deadline ghi cho route stream bằng `http.NewResponseController(w).SetWriteDeadline(time.Time{})`, hoặc tách server riêng |
| 2 | `router.go`: `middleware.ETag()` toàn cục | Có thể đệm/băm body, hỏng 206 | Stream đăng ký ngoài chuỗi middleware chung |
| 3 | Rate limiter theo `c.ClientIP()` (`ratelimit.go:53`) | **Đính chính**: limiter chỉ gắn vào 3 route (`router.go:73,98,130`) nên không chặn stream. Rủi ro còn lại: chưa `SetTrustedProxies` | Không gắn limiter này cho stream. Giới hạn theo token và số kết nối đồng thời. Chi tiết: file 04 mục B6, B10. |
| 4 | `youtube.go` chỉ đọc metadata (clients MWEB/TVHTML5/ANDROID_TESTSUITE/WEB) | Chưa có URL audio | Dùng `yt-dlp -g` làm chính, innertube Go làm phụ |
| 5 | Dockerfile Alpine không có Python/yt-dlp | Không chạy được yt-dlp | Dùng binary `yt-dlp` tĩnh hoặc thêm python3. Có lịch cập nhật. |
| 6 | Player Zustand 1173 dòng (`playerStore.ts`) gắn chặt `ytPlayerInstance`, `playbackRateCoordinator`, `backgroundAudioKeeper`, `mediaSessionWorker` | Thay engine trực tiếp rất rủi ro | Dùng Adapter, xem 02 |
| 7 | Mặc định nhạy cảm: DSN `root:310306@...` (`config.go:13,102`), admin `admin123` + `SeedData=true` (`config.go:142-145`). JWT mặc định **đã được chặn** ở production (`config.go:155-157`) | Lộ mật khẩu DB đã commit | Ghi đè bằng env, đổi mật khẩu `310306`. Chi tiết: file 04 mục B11. |
| 8 | `next.config.mjs` rewrite `/api/v1` chỉ chạy khi có Node/Vercel | FE tĩnh trên zHost không proxy được | FE gọi thẳng domain API tuyệt đối |

## 4. Phần code frontend "chữa cháy" sẽ không cần nữa
Khi `<audio>` thật chạy ổn:
- `lib/backgroundAudioKeeper.ts` (silent loop, WakeLock, heartbeat SW)
- `lib/mediaSessionWorker.ts` (Worker giữ phiên)
- `lib/playbackRateCoordinator.ts` (ép tốc độ qua iframe, đã gây lỗi Edge/Safari)
- `components/layout/YouTubeEngineHost.tsx`
- `lib/youtubeResolver.ts` (đo thời lượng bằng iframe, thay bằng metadata backend)

Chỉ xoá sau khi qua cổng chất lượng ở file 03. Trong lúc đó giữ làm fallback.

## 5. So sánh nhanh mindset gốc với thực tế dự án
| Mindset gốc | Thực tế dự án | Điều chỉnh |
|---|---|---|
| Node/Express, `youtubei.js` | Go/Gin | Viết lại bằng Go, trích URL bằng `yt-dlp` |
| Laptop Acer 2GB tự host | VPS Ubuntu + Docker + MySQL | Dư tài nguyên hơn. Cần quan tâm băng thông. |
| HTTPS qua Cloudflare Tunnel | Có kế hoạch tunnel | Cân nhắc đường riêng cho stream (xem 02 mục 5) |
| Chỉ lưu `videoId`, tập ảo | Đã có `episodes` start/end | Dùng luôn |
| Không có thanh toán | Có VIP + PayOS | Cần khoá quyền stream, rủi ro pháp lý cao hơn |
| Web/PWA | Web + app RN WebView | Cần thêm phương án cho app mobile |
