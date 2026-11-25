# 03. Kế hoạch triển khai và rủi ro

Nguyên tắc: **kiểm chứng điều rủi ro nhất trước, đổi ít nhất có thể, luôn giữ đường lui.**

## Giai đoạn 0: Kiểm chứng khả thi (0,5–1 ngày, chưa sửa code dự án)
Trên VPS production:
```bash
yt-dlp -f "bestaudio[ext=m4a]" -g "https://www.youtube.com/watch?v=<VIDEO_ID>"
curl -r 0-1 -I "<URL_VUA_RA>"        # mong đợi 206 + Content-Range
```
Thử với ít nhất 3–5 video thật đang có trong DB (ngắn, dài vài giờ, có tuổi/giới hạn).

**Cổng G0:**
- Ra URL và curl 206 → tiếp tục.
- Bị "Sign in to confirm you're not a bot" → thử cookies tài khoản phụ. Vẫn lỗi hoặc không ổn định → **dừng**, cân nhắc đường ra bằng IP khác (máy nhà qua tunnel), hoặc bỏ hướng này.

## Giai đoạn 1: Backend stream (2–3 ngày)
1. Gói `modules/stream` (token, cache, extractor, handler) và `infra/external/ytdlp.go`.
2. Sửa `main.go` theo 02 mục 2.1: mux tách stream, bỏ `WriteTimeout` cho stream.
3. Endpoint `POST /api/v1/audios/:id/stream-token` dùng `policy_engine`.
4. Dockerfile: thêm `yt-dlp`, cron/healthcheck cập nhật. Mount cookies (tuỳ chọn) qua volume.
5. Biến môi trường mới: `STREAM_TOKEN_SECRET`, `STREAM_URL_TTL`, `YTDLP_PATH`, `YTDLP_COOKIES_FILE`, `STREAM_MAX_CONCURRENT_EXTRACT`.
6. Test: unit (Range parser, token), integration giả lập upstream trả 206/403/410.

**Cổng G1 (test trên điện thoại thật, mở URL stream trực tiếp bằng trình duyệt):**
- [ ] Android Chrome: phát, tua, **khoá màn hình vẫn phát ≥ 30 phút**
- [ ] iPhone Safari: như trên
- [ ] Tua nhảy cóc trong video 8–10 giờ, độ trễ chấp nhận được
- [ ] Hết hạn link giữa chừng (xoá cache thủ công) tự phục hồi
- [ ] Ngắt Wi-Fi sang 4G không hỏng luồng
- [ ] CPU/RAM/băng thông VPS với 5–10 luồng đồng thời nằm trong ngưỡng

## Giai đoạn 2: Frontend adapter (3–5 ngày)
1. Tạo `lib/audio/AudioEngine.ts`, `HtmlAudioEngine.ts`, `YouTubeEngine.ts` (bọc code cũ).
2. Sửa `playerStore.ts` gọi qua interface. Giữ nguyên API công khai (`play`, `seekTo`, `nextEpisode`...) để UI không đổi.
3. Cờ `NEXT_PUBLIC_AUDIO_ENGINE`. Mặc định `youtube` ở production cho đến khi qua G2.
4. Media Session theo tập ảo. Auto-recovery. Tự hạ cấp về iframe khi lỗi liên tiếp.
5. Cập nhật `NEXT_PUBLIC_API_BASE_URL` và `ALLOWED_ORIGINS`. Build lại FE tĩnh và upload zHost (CI hiện có).
6. Test Vitest cho adapter và logic chuyển tập tại ranh giới `endSeconds`.

**Cổng G2 (bật cờ `stream` cho nhóm nhỏ/admin):**
- [ ] Chuyển tập ảo khi **tắt màn hình** không bị ngắt (iOS và Android)
- [ ] Màn hình khoá hiển thị đúng tên tập, đúng tiến trình theo tập
- [ ] Tốc độ 1.25/1.5/2x ổn định trên Chrome, Edge, Safari, Firefox
- [ ] Lưu và khôi phục tiến độ chính xác
- [ ] Tập VIP vẫn bị chặn đúng

## Giai đoạn 3: Mobile app và dọn dẹp (2–3 ngày)
1. Kiểm thử app RN (WebView) với engine mới. Nếu chưa đủ ổn mới cân nhắc `react-native-track-player` (xem 02 mục 7).
2. Bật mặc định `stream`. Theo dõi 1–2 tuần.
3. Khi ổn định mới xoá: `backgroundAudioKeeper.ts`, `mediaSessionWorker.ts`, `playbackRateCoordinator.ts`, `youtubeResolver.ts`, phần iframe dùng chỉ cho phát. **Giữ `YouTubeEngine` nếu vẫn muốn fallback.**
4. PWA: `manifest.json`, icon, nhắc "Add to Home Screen" cho iPhone.

## Giai đoạn 4 (tuỳ chọn): Chống video bị gỡ
Chỉ khi thực tế có video bị gỡ hoặc khiếu nại. Xem phần 6 của mindset gốc: hàng đợi tải `.m4a` gốc rồi đưa lên Cloudflare R2. Với dự án có tiền VIP, cần đánh giá pháp lý trước khi lưu trữ nội dung.

## Ma trận rủi ro
| Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu |
|---|---|---|---|
| YouTube chặn IP VPS ("not a bot") | Trung bình–cao | Rất cao (không có audio) | Cổng G0, cookies, IP phụ, fallback iframe |
| Cách lấy link YouTube đổi/hỏng | Cao theo thời gian | Cao | `yt-dlp` cập nhật tự động, extractor có thể thay, fallback iframe |
| Vi phạm ToS YouTube (proxy audio) khi có VIP/PayOS | Có thật | Cao (khiếu nại, mất kênh thu phí) | Tư vấn pháp lý. Cân nhắc tách tính năng trả phí khỏi nội dung phát lại, giới hạn quy mô. |
| Cloudflare giới hạn lưu lượng audio qua proxy | Có thể | Trung bình | Subdomain stream DNS-only hoặc Caddy trực tiếp |
| Băng thông/CPU VPS | Phụ thuộc số người nghe | Trung bình | Giới hạn kết nối đồng thời, đo ở G1 |
| Token stream bị chia sẻ | Trung bình | Thấp–trung bình | Token hạn ngắn, gắn video, giới hạn đồng thời |
| iOS chặn đổi `src` khi tắt màn hình | Chắc chắn nếu đổi `src` | Cao | Chuyển tập bằng `currentTime`, đổi `src` chỉ khi paused |
| Lộ bí mật mặc định trong repo | Có | Cao | Ghi đè bằng env, đổi mật khẩu, không dùng giá trị mặc định ở prod |

## Quyết định cần bạn chốt
1. Chạy Giai đoạn 0 trên VPS và gửi kết quả. Nếu thất bại thì có đi tiếp bằng IP khác không?
2. Có chấp nhận rủi ro pháp lý của việc proxy audio YouTube cho phần VIP không?
3. Stream đi chung Cloudflare Tunnel hay subdomain riêng DNS-only?
4. Tập VIP cần khoá tuyệt đối ở mức byte, hay chỉ khoá ở UI/token như hiện nay?
5. Ưu tiên app RN hay web/PWA?
