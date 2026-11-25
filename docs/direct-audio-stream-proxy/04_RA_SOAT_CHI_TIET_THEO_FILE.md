# 04. Rà soát toàn bộ dự án: chỉ rõ file, dòng, cách sửa

> Mọi số dòng dưới đây lấy từ mã nguồn hiện tại (kiểm tra ngày 25/11/2026). Mục nào chưa chắc thì ghi **[cần xác minh]**.
> Mức ưu tiên: **P0** = không sửa thì tính năng stream không chạy hoặc gây sự cố, **P1** = cần cho chất lượng, **P2** = cải tiến.

## 0. Đính chính các điều tôi đã nói ở tài liệu 01–03
| Nội dung cũ | Sự thật sau khi đọc mã | Hành động |
|---|---|---|
| "Rate limit sẽ chặn việc tua" | Limiter chỉ gắn vào 3 route: `router.go:73` (guest login), `:98` (import), `:130` (stats). Stream không bị ảnh hưởng nếu không gắn thêm. | Không gắn `RateLimiter` này vào stream. Dùng giới hạn đồng thời riêng (mục B6). |
| "Thêm domain zHost vào `ALLOWED_ORIGINS`" | Đã whitelist cứng trong `cors.go:29-31` (cùng `*.zhost.education`, `*.vercel.app`). | Không cần làm. |
| "Mặc định JWT lộ khi lên production" | `config.go:155-157` đã `log.Fatal` nếu production dùng secret mặc định. | Chỉ còn rủi ro DSN và admin mặc định (mục B11). |
| "`seekTo` là giây toàn cục hay theo tập?" | Là giây **theo tập**. Đổi sang tuyệt đối bằng `startSeconds + currentTime` (`playerStore.ts:356`, `:483`). | Engine nhận giây tuyệt đối, store giữ nguyên ngữ nghĩa. |
| "API production đi qua Cloudflare Tunnel (docs/06)" | Production đang dùng **Quick Tunnel** `*.trycloudflare.com` (`frontend/public/env-config.js:146`). | Xem mục B1, đây là rủi ro nghiêm trọng. |

---

## A. Backend Go

### B1 (P0). Quick Tunnel không phù hợp để phát audio
- `frontend/public/env-config.js:146` trỏ `VITE_API_BASE_URL` về `https://perth-obj-blackberry-favor.trycloudflare.com/api/v1`.
- `docker-compose.yml` không có service `cloudflared` (không có từ khoá `tunnel`/`cloudflared`). `deploy/ubuntu-deploy.sh:134` chỉ in lời gợi ý. Nghĩa là tunnel chạy tay ngoài compose.
- Quick Tunnel đổi URL mỗi lần khởi động lại và theo tài liệu Cloudflare không dành cho production, có giới hạn số request đồng thời **[cần xác minh trên tài liệu hiện hành]**. Phát audio nhiều tiếng, mỗi lần tua là một request, sẽ chạm giới hạn rất nhanh.
- **Sửa**: tạo **Named Tunnel** với domain riêng (ví dụ `api.<domain>`), chạy `cloudflared` làm service trong `docker-compose.yml`. Cho stream một hostname riêng (`stream.<domain>`).
- Sau khi có URL cố định, `CI` (`docker-ci.yml:453-458`) mới bớt phải ghi đè `env-config.js` mỗi lần.

### B2 (P0). `etag.go` đệm toàn bộ response vào RAM
- `middleware/etag.go:13-21`: `etagWriter` có `buf bytes.Buffer`, `Write()` chỉ ghi vào `buf`. `:39-42` băm SHA1 toàn bộ body rồi mới gửi. `:21` `WriteHeader` chỉ lưu mã trạng thái.
- Gắn toàn cục ở `router.go:45` cho mọi `GET`.
- Nếu stream đi qua Gin: toàn bộ audio sẽ được nạp vào RAM, mất 206, trong khi `docker-compose.yml:71-74` giới hạn container backend **200MB** (cpus 1.0, reservation 40MB).
- **Sửa**: stream **không** đi qua Gin. Tách `http.ServeMux` hoặc binary riêng (B3). Nếu buộc phải đi qua Gin thì bỏ qua ETag khi `Range` hoặc path bắt đầu bằng `/stream/`.

### B3 (P0). Tách stream thành binary riêng `cmd/stream`
- Repo đã có mẫu: `backend/cmd/api/main.go`, `backend/cmd/seed/main.go`. `backend/Dockerfile` build hai binary (`wavelink-api`, `wavelink-seed`).
- **Đề xuất**: thêm `backend/cmd/stream/main.go` thành binary thứ ba, chạy ở container `wavelink-streamer`.
  - Lý do: API giữ `WriteTimeout 20s` (`cmd/api/main.go:50-52`) và giới hạn RAM 200MB. Stream cần timeout dài, RAM riêng, `yt-dlp`, và hostname riêng.
  - Dùng chung package: `config`, `infra/external` (mở rộng `youtube.go`), `core/logic/policy_engine.go`, `server/middleware/auth.go` (verify JWT/token).
  - Thêm `COPY --from=builder /build/wavelink-stream /app/wavelink-stream` và dòng build trong `Dockerfile`.
  - Thêm service `streamer` trong `docker-compose.yml` (giới hạn ~150–250MB, `cpus: "1.0"`), tách `ports` riêng.
- Phương án ít việc hơn: cùng binary, `http.ServeMux` bọc ngoài Gin ở `cmd/api/main.go:49` (`Handler: router`). Nhược điểm: dùng chung giới hạn 200MB và timeout.

### B4 (P0). `youtube.go` chưa có đường lấy URL audio
- `infra/external/youtube.go:172-223` gọi `POST youtubei/v1/player` với 4 client (MWEB, TVHTML5, ANDROID_TESTSUITE, WEB, dòng `:182-198`).
- Struct `innertubePlayerResponse` (`:47-72`) **không có** `streamingData`.
- `http.Client{Timeout: 5s}` (`:173`) không dùng được cho stream (bị ngắt sau 5 giây).
- **Sửa**:
  1. Tạo `infra/external/ytdlp.go`: gọi `yt-dlp -g -f "bestaudio[ext=m4a]"` qua `exec.CommandContext` với timeout ~20s, trả `AudioInfo{URL, MIME, ContentLength, ApproxDurationMs, ExpiresAt}`.
  2. Thêm phương án phụ đọc `streamingData.adaptiveFormats[]` từ innertube (có `url`, `mimeType`, `contentLength`, `approxDurationMs`). Nhiều client trả `signatureCipher` hoặc cần PO Token nên chỉ coi là dự phòng.
  3. Tạo HTTP client riêng cho upstream: `Transport` có `ResponseHeaderTimeout: 15s`, **không đặt `Timeout` tổng**.
- Dockerfile runner (`alpine:3.20`, dòng `RUN apk add --no-cache ca-certificates tzdata curl`): thêm binary `yt-dlp` bản tĩnh (kiểm tra bản `musllinux` cho Alpine) **[cần xác minh]**. Không cài Python để tránh phình image và RAM.

### B5 (P0). Cấp quyền: dùng đúng hàm có sẵn, bỏ trùng lặp
- `core/logic/policy_engine.go:51-77` `CanAccessEpisode(user, audio, episode)` đã xử lý đúng: audio/tập VIP, `FreeEpisodesCount`, khách, VIP hết hạn (`:14-24` `IsActiveVIPOrAdmin`).
- Nhưng `modules/episode/handler.go:575-593` **tự viết lại** logic khoá tập bằng `isVipOrAdmin` + `freeLimit` thay vì gọi `CanAccessEpisode`. Hai nơi có thể lệch nhau.
- **Sửa**: refactor `GetEpisodesByAudioID` dùng `CanAccessEpisode` để đặt `IsLocked`, và endpoint cấp token stream dùng cùng hàm. Thêm test vào `logic_test.go:165` (`TestPolicyEngine`).

### B6 (P0). Token stream và giới hạn đồng thời
- `auth.go:33`: JWT sống 30 ngày. `:53-54`: `SessionMiddleware` (gắn toàn cục `router.go:44`) chấp nhận `?token=` ở **mọi** route. JWT nằm trong URL sẽ rơi vào log của Cloudflare, nginx, `gin.Logger` (`router.go:42`).
- **Sửa**:
  - Thêm `POST /api/v1/audios/:id/stream-token` trong `modules/audio/handler.go` (`RegisterRoutes` `:51`; router thật ở `router.go:89-100`).
  - Token riêng: HMAC(videoId, userId/guestId, exp ≈ 6 giờ) bằng `STREAM_TOKEN_SECRET`. Không dùng chung `JWT_SECRET`.
  - Giới hạn **2 luồng đồng thời/người dùng** và 1 semaphore toàn cục cho tiến trình `yt-dlp` (2–3).
  - Cân nhắc giới hạn `?token=` chỉ còn cho route stream (`auth.go:53-54`), tránh rò JWT 30 ngày.

### B7 (P1). Thêm trạng thái stream và kiểm tra ngay lúc import
- `modules/audio/handler.go:506` `FetchYouTubeMetadata(videoID)` rồi `:513-517` suy luận thời lượng, mặc định 3600s nếu không đọc được. `:555-559` chia tập mặc định 4 giờ (`episode_splitter.go:10` `DefaultBlockSizeSec = 14400`).
- **Ý tưởng**:
  - Ngay sau `:506`, chạy extractor để biết video **có phát được bằng stream không** (video riêng tư, giới hạn tuổi, live, bị chặn vùng). Lưu cờ vào bảng `youtube_videos`.
  - Thêm cột vào `domain.Audio` (`core/domain/types.go:60-74`): `StreamStatus` (OK/FAILED/UNKNOWN), `StreamCheckedAt`, `AudioMime`. Tạo `migrations/005_add_stream_columns.sql` (hiện có 001–004).
  - Lấy `ApproxDurationMs` từ extractor để sửa thời lượng, thay vì 3600s mặc định (`:517`). Có thể hiện `RefreshAudio` (`:808-824`) cập nhật lại.
  - **[cần xác minh]**: `docker-compose.yml` mount `./backend/migrations` vào `docker-entrypoint-initdb.d` (khoảng dòng 108), thư mục này chỉ chạy khi volume MySQL còn trống. Kiểm tra `infra/db/connection.go` có `AutoMigrate` không, nếu không thì phải áp migration 005 thủ công trên VPS.
- Admin: hiển thị huy hiệu "Stream OK/lỗi" ở `frontend/src/views/admin/AdminAudiosPage.tsx` và nút kiểm tra lại. Thêm job kiểm tra định kỳ vài video phổ biến.

### B8 (P1). CORS, Range và header
- `cors.go:68`: `Access-Control-Allow-Headers` không có `Range`, và không có `Access-Control-Expose-Headers`.
- Thẻ `<audio src>` **không cần CORS**. Chỉ cần khi dùng `fetch`, `crossorigin="anonymous"` hoặc Web Audio phân tích (ví dụ visualizer ở `components/ui/Equalizer.tsx`) **[cần xác minh nếu Equalizer đọc dữ liệu audio]**.
- Binary stream tự trả `Access-Control-Allow-Origin` theo whitelist (copy hàm `isOriginAllowed` từ `cors.go:33-53`), thêm `Allow-Headers: Range`, `Expose-Headers: Content-Range, Accept-Ranges, Content-Length`.

### B9 (P1). Reverse proxy cho chế độ fullstack
- `frontend/nginx.conf:71-86` chỉ proxy `/api/v1/`. Nếu dùng profile fullstack và stream cùng domain, thêm `location /stream/` với `proxy_buffering off; proxy_request_buffering off; proxy_http_version 1.1;` và **không** gắn `proxy_cache`.

### B10 (P1). Mạng và cổng
- `docker-compose.yml:32-33`: `ports: "${BACKEND_PORT:-8080}:8080"` mở cổng 8080 trên **mọi interface**, trong khi MySQL được bind `127.0.0.1` (`${MYSQL_BIND_IP:-127.0.0.1}`, khoảng dòng 104). Nếu đã có tunnel thì nên bind backend và streamer vào `127.0.0.1` và đóng cổng 8080 ở firewall.
- `ratelimit.go:53` dùng `c.ClientIP()`, `router.go` không gọi `SetTrustedProxies`. Gin mặc định tin mọi proxy nên `X-Forwarded-For` có thể bị giả mạo, và nếu tin sai thì giới hạn theo IP vô nghĩa. Đặt `r.SetTrustedProxies([]string{"127.0.0.1", "172.16.0.0/12"})` **[cần xác minh mạng Docker thực tế]**.

### B11 (P1). Mặc định nhạy cảm còn sót
- `config.go:13` `DefaultMySQLDSN = "root:310306@tcp(127.0.0.1:3306)/..."` và `:102` dùng khi `DB_SOURCE` rỗng. Mật khẩu `310306` nằm trong mã nguồn đã commit, nên coi là lộ, cần đổi.
- `config.go:142-145`: admin mặc định `admin123/admin123`, `SeedData` mặc định `true`. Production phải ghi đè.
- `AndroidManifest.xml:22` `usesCleartextTraffic="true"`: sau khi có HTTPS hoàn chỉnh nên tắt.

### B12 (P2). Quan sát và vận hành
- Ghi log có cấu trúc bằng `slog` (đã dùng ở `cmd/api/main.go`) cho mỗi lượt stream: `videoId`, thời gian extract (ms), mã upstream, số byte, lý do ngắt.
- Cảnh báo khi tỷ lệ 403/410 từ googlevideo tăng đột biến (dấu hiệu bị chặn IP).
- Thêm endpoint `/health` riêng cho streamer (mẫu ở `router.go:53`) và healthcheck trong compose (như `docker-compose.yml:63`).
- Cron cập nhật `yt-dlp` mỗi ngày hoặc rebuild image theo lịch (có `docker-ci.yml` sẵn).
- Cân nhắc chọn định dạng tiết kiệm băng thông cho giọng nói: itag 139 (~48kbps) nếu có, mặc định 140 (~128kbps). 48kbps ≈ 21MB/giờ so với 56MB/giờ **[cần thử chất lượng nghe thực tế]**. Cấu hình bằng `STREAM_AUDIO_ITAG`.

---

## B. Frontend

### F1 (P0). `playerStore.ts`: danh sách điểm chạm với YouTube
Đây là các khối cần chuyển sang gọi `engine.*` (tổng ~19 điểm, file 1173 dòng):

| Dòng | Hiện đang làm | Chuyển thành |
|---|---|---|
| 28 | `let ytPlayerInstance` | Biến `engine: AudioEngine` |
| 105–116 | Đo tốc độ phát qua `getCurrentTime()` (hàm đo rate) | Bỏ khi dùng `<audio>` (tốc độ chuẩn) |
| 243–264 | `setYtInstance` và nạp lại video khi player sẵn sàng (`loadVideoById`) | `engine.ready` |
| 303–304 | Tập mặc định cả video: `startSeconds: 0`, `endSeconds: totalDuration \|\| 14400` | Giữ |
| 356, 372–380 | `absoluteStart = startSeconds + currentTime`, `loadVideoById`, `playVideo` | `engine.load(videoId, absoluteStart)` |
| 398–404 | `togglePlay`: `pauseVideo`/`playVideo` + `rateCoordinator.applyRate` | `engine.play()/pause()` |
| 430–432, 446–449 | `pause`, `resume` | như trên |
| 483–488 | `seekTo` → `ytPlayerInstance.seekTo(absoluteTarget, true)` | `engine.seek(absoluteTarget)` |
| 625–642 | `close`: đọc `getCurrentTime`, `pauseVideo` | `engine.getTime()`, `engine.pause()` |
| 673–676 | `reset` | `engine.stop()` |
| 727–729 | `handleEpisodeComplete`: `pauseVideo` | xem F2 |
| 768–786 | Tick của worker: `getCurrentTime`, `getPlaybackRate` | `engine.getTime()` |
| 803 | `pollTimer = setInterval(..., 1000)` | Sự kiện `timeupdate` |
| 834–907 | Vòng poll, watchdog tốc độ, phát hiện hết tập | xem F2 |
| 923, 929 | `heartbeatTimer` | Bỏ |
| 1041–1047 | Khi quay lại tab: nếu đang PAUSE thì `playVideo` + `applyRate` | Bỏ (không cần với `<audio>`) |

Giữ nguyên API công khai của store (`play`, `seekTo`, `nextEpisode`, `setPlaybackRate`...) để `PlayerPage.tsx` (`:386` `play(audio, targetEp, audio.lastPositionSeconds || 0)`, `:761` `seekTo`), `MiniPlayer.tsx` (`:111` `seekTo`) và `mobileBridge.ts` không phải sửa.

### F2 (P0). Phát hiện hết tập và chuyển tập khi tắt màn hình
- `playerStore.ts:864-897`: vòng poll mỗi giây so `absTime >= endSec`, rồi `ytPlayerInstance.pauseVideo()` + `seekTo(endSec)` (`:893-894`) và `handleEpisodeComplete()` (`:897`).
- Với `<audio>`: khi tắt màn hình, `setInterval` bị trình duyệt giảm tần suất, nhưng sự kiện `timeupdate` của phần tử đang phát vẫn tiếp tục **[cần xác minh trên iOS/Android thật]**. Dùng `timeupdate` làm nguồn chính, kèm một `setTimeout` đặt trước theo `(endSec - currentTime) / playbackRate`.
- **Không `pause()` khi chuyển sang tập kế** (`:893`): các tập liền nhau trên cùng luồng, chỉ cần cập nhật state tập và `mediaSession`. Việc dừng rồi phát lại lúc tắt màn hình là điểm iOS dễ cắt phiên **[cần xác minh]**.
- Chặn lặp: `timeupdate` đến liên tục nên cần cờ `episodeAdvancing` để chỉ chuyển một lần.

### F3 (P0). Hai điểm gắn engine host, phải đổi cả hai
- `frontend/src/app/client-shell.tsx:10,71` (Next.js) và `frontend/src/components/layout/MainLayout.tsx:7,46` (Vite) cùng render `<YouTubeEngineHost />`.
- CI deploy zHost lấy gói **Vite** (`dist-extracted`, `docker-ci.yml:438-454`), còn Vercel dùng **Next**. Phải thay cả hai bằng `AudioEngineHost`.
- `YouTubeEngineHost.tsx:27-41` đã đăng ký các `mediaSession` handler (play, pause, seekto...). Tái sử dụng khi viết `AudioEngineHost`. `:202-281` (xử lý `visibilitychange` bằng `playVideo`) và `:303-317` (div `#yt-player-target`) bỏ đi.

### F4 (P1). Nơi dùng `backgroundAudioKeeper`
Gỡ dần theo thứ tự sau khi qua cổng G2:
- `playerStore.ts`: `:214, 389, 416, 422, 440, 457, 613, 649, 683, 828` (start/stop)
- `YouTubeEngineHost.tsx:5`, `providers.tsx:10,29`, `frontend/src/App.tsx:9,17`, `views/PlayerPage.tsx:52,363`, `stores/authStore.ts:8`
- Test: `test/issuesFixes.test.ts:8`, `test/playerAndNotificationFixes.test.tsx:8`
- Tài nguyên: `public/silence.mp3`, được precache ở `public/sw.js:15`.
- Tương tự `mediaSessionWorker` (gọi ở `playerStore.ts:390,417,458`) và `playbackRateCoordinator.ts`.

### F5 (P1). `youtubeResolver` chưa thể xoá ngay
- `views/UploadPage.tsx:38,258,277,386` dùng `resolveYouTubeDurationViaIframe` để đo thời lượng khi server không trả được.
- Chỉ xoá sau khi backend trả thời lượng đáng tin từ extractor (B7).

### F6 (P0). Service Worker sẽ phá luồng nếu stream cùng origin
- `public/sw.js:50-77`: network-first cho mọi GET cùng origin và `cache.put(request, networkResponse.clone())` (`:67`). Chỉ loại trừ `/api/` ở `:59`.
- Nếu stream cùng origin (profile fullstack) thì SW sẽ cố cache phản hồi 206 (`Cache.put` không nhận 206) và `clone()` luồng lớn.
- **Sửa**: thêm ngay sau `:59`: `if (url.pathname.startsWith('/stream/') || request.headers.has('range')) return;` và tăng `CACHE_NAME` (`:8`).
- Nếu stream ở hostname khác (đề xuất) thì SW không chạm vào, theo chú thích dòng `:54` **[cần xác minh khi kiểm thử]**.

### F7 (P0). Cấu hình URL stream trên hosting tĩnh
- `public/env-config.js:144-148` là cấu hình runtime của zHost. `lib/axiosClient.ts:4-7` đọc `window.__ENV__`.
- **Sửa**: thêm khoá `STREAM_BASE_URL` vào `env-config.js` và vào `axiosClient.ts` (hoặc file `lib/streamConfig.ts` mới).
- **Bẫy CI**: `docker-ci.yml:458` dùng `printf` ghi đè **toàn bộ** `env-config.js` chỉ với `VITE_API_BASE_URL` và `APP_ENV`. Nếu chỉ sửa file trong repo mà không sửa dòng `printf` này thì khoá mới sẽ bị xoá mỗi lần deploy. Phải thêm `STREAM_BASE_URL` vào `printf` (và một secret `PROD_STREAM_BASE_URL`).
- `docker-ci.yml:124, 131-132, 413`: URL mặc định rơi về `https://wavelink-audio-app-backend-latest.onrender.com/api/v1` nếu thiếu secret. Bản FE trên zHost có thể âm thầm gọi Render. Nên bỏ giá trị mặc định này ở job production, thay bằng lỗi "thiếu secret".

### F8 (P1). Không có CSP chặn `<audio>`
- Đã tìm CSP/`media-src` trong `.htaccess`, `nginx.conf`, `vercel.json`, `layout.tsx`: **không có**. Không cần cập nhật. Nếu sau này thêm CSP thì cần `media-src https://stream.<domain>`.

### F9 (P1). Đừng đi qua rewrite của Next/Vercel
- `next.config.mjs` rewrite `/api/v1/:path*` sang backend. Với Vercel preview, URL stream phải là **URL tuyệt đối** tới host stream, không được qua rewrite (giới hạn thời gian và kích thước phản hồi).

### F10 (P2). Kiểm thử hiện có phải giữ chạy được
- `test/playerStore.test.ts:219, 232, 251, 272` và `test/playerAndNotificationFixes.test.tsx:239, 257` dùng `setYtInstance(mockPlayer)` và `rateCoordinator`.
- **Cách làm**: giữ `setYtInstance` hoạt động như `YouTubeEngine` để các test này không đổi. Viết test mới cho `HtmlAudioEngine`: jsdom không cài `HTMLMediaElement.play/pause`, nên cần mock (`vi.spyOn(HTMLMediaElement.prototype, 'play')`).

### F11 (P2). Phát hiện phụ ở frontend
- `components/layout/MiniPlayer.tsx:32`: `duration || currentEpisode?.duration || 14400`. Mốc 14400 xuất hiện ở nhiều nơi (cũng ở `playerStore.ts:304, 339, 958`). Khi `audio.duration` thật có sẵn thì dùng nó, bỏ mốc giả.
- `public/manifest.json`: shortcut `url: "/#/library"` nhưng app dùng `BrowserRouter` (`frontend/src/App.tsx`), shortcut có thể sai đường dẫn **[cần xác minh]**. Cả hai biểu tượng 192 và 512 cùng trỏ một file `wavelink-icon.png`.

---

## C. App mobile (React Native)

### M1. App thực chất là WebView của trang web
- `mobile/src/config/appConfig.ts`: `WEB_URL = 'https://wavelink-audio-app.zhost.education/'`. `App.tsx:437` `source={{ uri: getActiveWebUrl() }}`, `:461` đặt `userAgent` giả Chrome.
- Hệ quả tốt: khi web chuyển sang `<audio>`, app **hưởng luôn** mà không cần phát hành lại APK, nếu giữ tương thích với bridge.

### M2 (P0). Script bơm vào WebView sẽ xung đột với `<audio>`
`App.tsx` có `INJECTED_MEDIA_BRIDGE_SCRIPT` (khoảng dòng 26–190):
- Giả mạo `document.hidden` và `visibilityState` luôn là "visible" (khoảng dòng 33–52) và chặn `visibilitychange`, `blur`, `pagehide` (khoảng dòng 59–63).
- Ghi đè `HTMLMediaElement.prototype.pause` (khoảng dòng 66–70), chỉ cho dừng khi cờ `__wavelinkUserWantsPause` bật. Ghi đè này áp dụng cho **mọi** thẻ media, kể cả `<audio>` mới.
- Gửi lệnh vào iframe YouTube qua `postMessage` (`:109, :122, :134`: `playVideo`, `pauseVideo`, `seekTo`).
- Điều khiển từ notification (`:312-341`) gọi `window.__wavelinkControl.*` do script này tạo ra, **không** gọi `__wavelinkMobileDispatch` của web.
- **Sửa**:
  1. Thêm cờ (ví dụ `window.__WAVELINK_ENGINE__ = 'stream'` do web đặt, hoặc thêm query `?engine=stream` vào `WEB_URL`) để script tự tắt các hack ở chế độ stream.
  2. `App.tsx:312-341`: đổi sang `window.__wavelinkMobileDispatch(action, payload)` (đã có `togglePlay/play/pause/next/prev/seekTo` trong `frontend/src/lib/mobileBridge.ts`).
  3. `mobileBridge.ts`: thêm `case 'rewind'` và `'forward'` (service gửi `rewind 15.0` và `forward 30.0` ở `MediaPlaybackService.kt:191-192`).
  4. Phát hành APK mới. APK cũ (`wave-link-mobile-v1.apk`, `-v2.apk` trong repo) vẫn mang script cũ, hãy đặt nhận diện phiên bản (User-Agent hoặc `window.__WAVELINK_APP_VERSION__`) để web chọn engine phù hợp.

### M3 (P1). Nền tảng native đã đủ cho phát nền
- `AndroidManifest.xml:8-10,41-45`: quyền `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`, service `foregroundServiceType="mediaPlayback"`.
- `MediaPlaybackService.kt`: `MediaSessionCompat` (`:57,84`), `PARTIAL_WAKE_LOCK` (`:77`), `startForeground` (`:142,148`). Tức là tiến trình đã được giữ sống khi tắt màn hình, nên **chưa cần** `react-native-track-player` ở giai đoạn đầu.
- Điểm cần sửa: `wakeLock?.acquire(24 * 60 * 60 * 1000L)` ở `:137` và `:160` giữ CPU tới 24 giờ kể cả khi tạm dừng lâu. Chỉ giữ khi đang phát, nhả khi `isPlaying=false` quá vài phút.
- `notifyMobilePlaybackState` (`mobileBridge.ts:37`) chỉ gửi khi đổi audio, tập hoặc trạng thái play/pause. Đủ cho notification, nhưng thanh tiến trình trên notification sẽ không chạy nếu không cập nhật `currentTime`. Gửi thêm mỗi ~15 giây hoặc khi `seek`.

---

## D. Ý tưởng bổ sung đáng làm

| # | Ý tưởng | Đặt ở đâu | Ưu tiên |
|---|---|---|---|
| 1 | Làm nóng cache: khi mở trang nghe hoặc cấp token, chạy extractor nền để byte đầu tiên đến nhanh | `stream-token` handler (B6) | P1 |
| 2 | Trả `streamStatus` trong `GET /audios/:id` (`audio/handler.go:304`) để FE ẩn hoặc chọn iframe nếu video không stream được | `types.go:60-74` | P1 |
| 3 | Tự động hạ cấp về iframe khi `<audio>` lỗi liên tiếp ≥ 3 lần/video; lưu cờ `localStorage` để lần sau khỏi thử lại | `HtmlAudioEngine` | P1 |
| 4 | Khôi phục vị trí: `play(audio, ep, lastPositionSeconds)` (`PlayerPage.tsx:386`) → `load()` rồi gán `currentTime` ở `loadedmetadata` | `AudioEngine.load` | P1 |
| 5 | Tắt dần âm lượng khi hẹn giờ ngủ (`sleepTimerWorker`, `playerStore.ts:580-613`) thay vì dừng đột ngột | `setSleepTimer` | P2 |
| 6 | `audio.preservesPitch = true` và dùng `playbackRate` gốc, bỏ toàn bộ `playbackRateCoordinator` ở chế độ stream | Engine | P1 |
| 7 | Gom kết nối: nhiều người cùng nghe một video vẫn tạo nhiều kết nối đến Google. Nếu số người nghe cùng lúc tăng, cân nhắc cache khối nhỏ trong RAM (ví dụ 2–4MB gần vị trí đang nghe). Chỉ làm khi đo thấy cần | Streamer | P2 |
| 8 | Thống kê chất lượng: số lần 403/410, thời gian extract trung bình, tỷ lệ hạ cấp, hiển thị ở trang admin (`modules/stats/handler.go`, `StatsPage`) | Streamer, stats | P2 |

---

## E. Thứ tự việc đề xuất (theo phụ thuộc)
1. **G0**: chạy `yt-dlp -g` trên VPS (file 03).
2. **B1**: chuyển sang Named Tunnel hoặc domain cố định cho stream.
3. **B3+B4+B5+B6**: binary `cmd/stream`, extractor, token, policy. Kiểm tra bằng mở URL stream trên điện thoại (cổng G1).
4. **F7 + F6**: cấu hình `STREAM_BASE_URL` (kể cả dòng `printf` trong CI) và loại trừ SW.
5. **F1–F3**: `AudioEngine`, `HtmlAudioEngine`, `AudioEngineHost`, thay ở cả hai điểm gắn, chạy sau cờ.
6. **M2**: sửa script bơm và `App.tsx`, phát hành APK mới.
7. **B7, D-1..4**: trạng thái stream, làm nóng cache, hạ cấp tự động.
8. Dọn dẹp **F4, F5**, siết **B10, B11, M3**.
