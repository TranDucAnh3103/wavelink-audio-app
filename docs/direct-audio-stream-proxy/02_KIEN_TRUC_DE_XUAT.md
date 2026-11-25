# 02. Kiến trúc đề xuất

## 1. Sơ đồ tổng thể
```text
FE (zHost, tĩnh)
  playerStore ──► AudioEngine (interface)
                    ├─ HtmlAudioEngine  ◄── mặc định mới   <audio src="https://STREAM_HOST/stream/{videoId}?st=...">
                    └─ YouTubeEngine    ◄── fallback (code cũ bọc lại)
  navigator.mediaSession ◄── đồng bộ theo tập ảo

BE Go (VPS, Docker)
  /api/v1/...                       (Gin như cũ, có ETag, rate limit)
  POST /api/v1/audios/:id/stream-token   → kiểm tra policy_engine → trả stream token
  GET|HEAD /stream/:videoId?st=...       → handler RIÊNG, ngoài chuỗi middleware chung
        ├─ verify token (HMAC, hạn ngắn, gắn videoId)
        ├─ cache {videoId → url, mime, contentLength, expiresAt} (RAM, singleflight)
        ├─ extractor: yt-dlp -g (chính), innertube Go (phụ)
        └─ proxy Range → googlevideo, trả 206 đủ header
```

## 2. Backend Go: stream proxy

### 2.1. Tách khỏi chuỗi middleware
Đăng ký stream trên `http.ServeMux` bọc ngoài Gin, hoặc một `http.Server` riêng cổng khác. Lý do: tránh ETag, rate limit, `gin.Logger` (ghi mỗi request Range) và timeout 20s.

```go
// cmd/api/main.go (ý tưởng)
mux := http.NewServeMux()
mux.Handle("/stream/", streamHandler)   // không middleware chung
mux.Handle("/", router)                 // Gin
srv := &http.Server{
    Handler:           mux,
    ReadHeaderTimeout: 10 * time.Second,
    // KHÔNG đặt WriteTimeout toàn cục. API Gin tự dùng context timeout.
    IdleTimeout:       120 * time.Second,
}
```
Nếu muốn giữ `WriteTimeout` cho API thì stream tự gỡ: `http.NewResponseController(w).SetWriteDeadline(time.Time{})`.

### 2.2. Handler (khung, cần hoàn thiện khi làm)
```go
func (h *StreamHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    videoID := strings.TrimPrefix(r.URL.Path, "/stream/")
    if !h.tokens.Verify(r.URL.Query().Get("st"), videoID) { http.Error(w, "forbidden", 403); return }

    rc := http.NewResponseController(w)
    _ = rc.SetWriteDeadline(time.Time{})

    info, err := h.cache.Get(r.Context(), videoID) // singleflight + TTL ~4h
    if err != nil { http.Error(w, "extract failed", 502); return }

    resp, err := h.fetchUpstream(r.Context(), info, r.Header.Get("Range"))
    if isExpired(resp, err) { // 403/410 → làm mới URL và thử LẠI 1 LẦN, người nghe không thấy lỗi
        h.cache.Invalidate(videoID)
        info, err = h.cache.Get(r.Context(), videoID)
        if err == nil { resp, err = h.fetchUpstream(r.Context(), info, r.Header.Get("Range")) }
    }
    if err != nil { http.Error(w, "upstream failed", 502); return }
    defer resp.Body.Close()

    hd := w.Header()
    hd.Set("Content-Type", info.MIME)       // audio/mp4
    hd.Set("Accept-Ranges", "bytes")
    hd.Set("Cache-Control", "private, no-store")
    hd.Set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
    copyIfPresent(hd, resp.Header, "Content-Length", "Content-Range")
    w.WriteHeader(resp.StatusCode)           // 200 hoặc 206
    io.Copy(w, resp.Body)                    // r.Context() huỷ khi client ngắt/tua → upstream đóng theo
}
```

### 2.3. Chi tiết dễ sai
- **Probe của iOS**: `Range: bytes=0-1` bắt buộc trả 206 kèm `Content-Range` và `Content-Length` đúng. Với HEAD hoặc khi chưa có Range, vẫn trả `Accept-Ranges: bytes` và độ dài lấy từ tham số `clen=` của URL googlevideo.
- **Range mở (`bytes=0-`)**: googlevideo thường giới hạn tốc độ hoặc ngắt kết nối với request tải liền một khối. yt-dlp tránh bằng cách chia khối khoảng 10MB. Proxy nên **giới hạn đầu cuối range tối đa khoảng 10MB** rồi trả 206, trình duyệt sẽ tự xin tiếp. Cần thử thực tế để chốt con số.
- **Định dạng**: chọn m4a/AAC (`-f "bestaudio[ext=m4a]"`, thường itag 140). Tương thích iOS tốt nhất. WebM/Opus chỉ làm phương án phụ cho Android/Chrome.
- **Ràng buộc IP**: link googlevideo gắn với IP đã lấy link. Lấy và tải phải cùng một VPS. Nếu đặt yt-dlp trong container khác, phải cùng đường ra IP.
- **Cache**: TTL 3–4 giờ. Dùng `singleflight` để nhiều người cùng bấm một video chỉ chạy yt-dlp một lần. Giới hạn số tiến trình yt-dlp chạy đồng thời (ví dụ 2).
- **Backpressure**: `io.Copy` đã xử lý. Không `ReadAll`.
- **Gom nghe chung**: nếu nhiều người nghe cùng một video, mỗi người vẫn là một kết nối riêng đến Google. Đây là điểm tiêu thụ băng thông (xem mục 5).

### 2.4. Extractor
| Ưu tiên | Cách | Ghi chú |
|---|---|---|
| 1 | `yt-dlp -g -f "bestaudio[ext=m4a]/bestaudio"` chạy trong container | Cộng đồng sửa nhanh khi YouTube đổi. Cron cập nhật hằng ngày (`yt-dlp -U` hoặc rebuild image). |
| 2 | Innertube client trong `youtube.go` (mở rộng đọc `streamingData`) | Dễ gãy và có thể cần PO Token. Chỉ làm dự phòng. |
| 3 | Cookies tài khoản phụ (`--cookies`) | Khi gặp "Sign in to confirm you're not a bot". Cookie được mount qua volume, không commit. |

Interface để thay đổi dễ: `type Extractor interface { Extract(ctx, videoID) (*AudioInfo, error) }`.

## 3. Dữ liệu và tập ảo (gần như không đổi)
- `Episode.StartSeconds/EndSeconds` là mốc **trên toàn luồng**. Frontend chỉ cần `audio.currentTime = episode.startSeconds`.
- **Đã xác minh**: `currentTime` và `seekTo(seconds)` trong `playerStore.ts` là giây **theo tập**; giây tuyệt đối = `startSeconds + currentTime` (`playerStore.ts:356`, `:483`). Engine nhận giây tuyệt đối, store giữ nguyên ngữ nghĩa. `listening_progress` cũng lưu theo tập (`progress/handler.go:53-54`).
- Tiến độ: giữ `listening_progress` theo `episode_id`. Giữ nhịp đồng bộ như hiện nay, bổ sung gửi ngay khi `pause`/`visibilitychange`/`pagehide` (`sendBeacon`).
- Không cần bảng mới. Có thể thêm cột cache thời lượng thật nếu muốn bỏ `youtubeResolver.ts`.

## 4. Bảo mật stream (bắt buộc vì có VIP + PayOS)
`<audio>` không gửi được header `Authorization`, và JWT hiện có sống 30 ngày. **Không nên nhét JWT vào URL** vì sẽ lọt vào log và lịch sử.

Quy trình đề xuất:
1. FE gọi `POST /api/v1/audios/:id/stream-token` (có Bearer như các API khác).
2. BE kiểm tra bằng `policy_engine` (tập miễn phí hoặc VIP còn hạn, trạng thái ACTIVE).
3. BE trả `st` = HMAC(videoId, userId hoặc guestId, exp ~6 giờ), ký bằng secret riêng với JWT.
4. `<audio src=".../stream/{videoId}?st=...">`. Khi gần hết hạn, FE xin token mới và gán lại `src` ở **thời điểm tạm dừng hoặc khi lỗi** (đổi `src` lúc tắt màn hình sẽ bị iOS chặn).
5. Một tài khoản chỉ được cấp số lượng token đồng thời giới hạn (chống chia sẻ link).

Lưu ý: token gắn với `videoId` chứ không gắn tập. Quyền theo tập (tập 2+ chỉ cho VIP) không thể ép ở mức byte vì tất cả tập nằm trên một luồng. Nếu cần chặn chặt, chỉ cấp token cho video khi người dùng có quyền nghe ít nhất tập đang mở, và chấp nhận rằng người dùng kỹ thuật có thể tua sang tập khác. Đây là đánh đổi của mô hình "một luồng nhiều tập ảo". Nếu mô hình kinh doanh cần khoá tập VIP tuyệt đối, hãy giới hạn ở backend: **proxy từ chối Range nằm ngoài vùng `[start, end]` của các tập được phép** (cần truyền kèm quyền trong token, và tính offset byte từ bitrate nên chỉ xấp xỉ).

## 5. Mạng và HTTPS
- `<audio>` phát từ origin khác với FE vẫn được. Chỉ cần HTTPS cho cả hai. `navigator.mediaSession` yêu cầu trang FE chạy HTTPS (zHost đã có).
- **Đường cho API**: giữ Cloudflare Tunnel như `docs/06`.
- **Đường cho stream**: nên xem xét tách subdomain riêng, ví dụ `stream.<domain>`.
  - Lý do: điều khoản Cloudflare gói miễn phí thường hạn chế việc phục vụ khối lượng lớn nội dung video/audio không phải HTML qua mạng proxy của họ. Cần đọc lại điều khoản hiện hành trước khi quyết định.
  - Phương án thay thế: Caddy hoặc nginx với Let's Encrypt trực tiếp trên VPS, bản ghi DNS ở chế độ **DNS only**. Đổi lại lộ IP VPS.
  - Có thể bắt đầu bằng cùng tunnel để thử, đo, rồi mới tách.
- CORS: domain zHost đã được whitelist cứng ở `cors.go:29-31`, không cần thêm. Binary stream tự trả `Expose-Headers`. **Lưu ý quan trọng**: production hiện dùng Quick Tunnel (`env-config.js:146`), xem file 04 mục B1.
- Cấu hình reverse proxy: tắt buffering cho `/stream/` (`proxy_buffering off` với nginx), giữ `Range`.
- Băng thông: audio m4a ~128kbps ≈ 56MB/giờ/người. Nghe 1.5x không làm tăng băng thông theo giờ nghe thực, nhưng tăng theo giờ nội dung. Cần đối chiếu hạn mức băng thông của VPS.

## 6. Frontend: AudioEngine adapter
```ts
interface AudioEngine {
  load(videoId: string, startSec: number, autoplay: boolean): Promise<void>;
  play(): Promise<void>; pause(): void;
  seek(sec: number): void; setRate(r: number): void;
  getTime(): number; getDuration(): number;
  on(evt: 'time'|'state'|'ended'|'error', cb: (...a:any[])=>void): () => void;
  destroy(): void;
}
```
- `HtmlAudioEngine`: một thẻ `<audio>` duy nhất, gắn vào document **một lần** và không bị unmount khi đổi route (đặt ở `client-shell.tsx`/layout, tương tự `YouTubeEngineHost`).
  - `preload="metadata"`, `playbackRate` gốc, `preservesPitch = true`.
  - Chuyển tập = `currentTime = startSec`. **Không đổi `src`**.
  - `timeupdate` kiểm tra `currentTime >= episode.endSeconds` thì chuyển tập kế (khi màn hình tắt `timeupdate` vẫn chạy, nhưng nên kiểm tra thêm bằng `ontimeupdate` thay vì `setInterval`).
  - Tự phục hồi lỗi: lưu `lastTime`, xin token mới, `load()`, gán lại `currentTime` ở `loadedmetadata`, thử lại có giới hạn số lần.
  - `mediaSession`: `metadata`, `setPositionState` theo tập ảo, handler `play/pause/seekto/previoustrack/nexttrack`. Trên iOS ưu tiên nút chuyển tập (gán `null` cho `seekbackward/seekforward`).
- `YouTubeEngine`: bọc code đang chạy, **không sửa hành vi**.
- Chọn engine: `NEXT_PUBLIC_AUDIO_ENGINE=stream|youtube`. Có thể thêm tự động hạ cấp: nếu `HtmlAudioEngine` lỗi liên tiếp N lần cho một video thì chuyển sang `YouTubeEngine` và hiển thị thông báo.
- `playerStore` chỉ gọi interface. Phần ép tốc độ (`rateCoordinator`) chỉ chạy với `YouTubeEngine`.

## 7. App mobile (React Native)
- Hiện tại WebView tải trang web, nên khi web đã dùng `<audio>` thì app **hưởng luôn** lợi ích mà không cần sửa nhiều. Android WebView giữ âm thanh nền tốt hơn iframe YouTube nhưng vẫn cần kiểm thử thực tế: khoá màn hình, tiết kiệm pin, hạn chế nền của từng hãng.
- Nếu chưa đạt: giữ module `MediaPlayback` (foreground service + MediaStyle notification) làm lớp giữ tiến trình và nhận lệnh play/pause từ notification, hoặc chuyển hẳn sang `react-native-track-player` phát trực tiếp URL stream. Phương án này làm sau, **chỉ khi** Giai đoạn 3 cho thấy WebView chưa đủ ổn.
- iOS chưa có trong dự án (chỉ Android). Với iPhone dùng web/PWA (`manifest.json`, "Add to Home Screen").
