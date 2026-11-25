# Kiến trúc & Mindset Chuyển đổi Web App Nghe Truyện Audio
> **Mục tiêu:** Chuyển đổi dự án nghe truyện hiện tại từ **YouTube Iframe** sang **Direct Audio Stream Proxy + HTML5 Audio + Media Session API**.  
> **Ràng buộc cốt lõi:** 100% miễn phí, tự host trên phần cứng cá nhân (**Acer Aspire 5733Z — Intel Pentium P6200, 2GB RAM, HDD**), không lưu file audio xuống ổ cứng, không convert MP3, nghe mượt khi tắt màn hình trên iOS/Android.

---

## 1. Bối cảnh & Tư duy cốt lõi (Core Mindset)

### 1.1. Tại sao phải bỏ YouTube Iframe?
* **Bị hệ điều hành chặn chạy nền:** Trình duyệt (đặc biệt là iOS Safari) coi YouTube `<iframe>` là trang web nhúng video, nên tự động ngắt kết nối/tạm dừng ngay khi khóa màn hình hoặc chuyển app.
* **Hạn chế quyền kiểm soát:** Không đồng bộ được bộ điều khiển màn hình khóa (Lockscreen Controls), khó xử lý chia tập ảo mượt mà khi tắt màn hình.

### 1.2. Tại sao KHÔNG dùng phương án tải về + Convert MP3 + Upload Telegram Bot?
* **Giới hạn Bot API:** Telegram Bot API chỉ cho upload tối đa **50MB** và tải về **20MB** (audio 10 tiếng nặng 300–500MB sẽ lỗi). Muốn vượt giới hạn phải tự viết MTProto Range Proxy phức tạp.
* **Sát thủ phần cứng cũ:** Dùng FFmpeg nén video 10 tiếng sang MP3 làm CPU Pentium P6200 chạy 100% liên tục, dễ tràn RAM 2GB và gây quá tải đọc/ghi (full disk) trên ổ HDD.
* **MP3 kém khi tua file dài:** Định dạng MP3 không tối ưu cho `HTTP Range Request` khi tua nhảy cóc trên file hàng chục tiếng.

### 1.3. Ba nguyên tắc vàng của kiến trúc mới
1. **Tách bạch "Dữ liệu" và "Luồng phát":**
   * **Lưu vĩnh viễn vào Database (vài KB):** `videoId`, tên truyện, ảnh bìa, danh sách khung giờ các tập ảo, và vị trí giây đang nghe dở.
   * **Đi qua RAM (0MB ổ cứng):** Âm thanh chỉ chảy qua server như một **ống dẫn nước** (stream từng chunk 64KB–256KB) rồi đẩy thẳng xuống trình duyệt.
2. **Không convert — Dùng thẳng luồng Audio gốc của YouTube:**
   * YouTube tách sẵn luồng hình ảnh và luồng âm thanh độc lập. Ta chỉ trích xuất luồng âm thanh gốc định dạng `.m4a` (AAC) hoặc `.webm` (Opus).
   * Trình duyệt iOS/Android phát trực tiếp được `.m4a`, tua chính xác, tốn **0 giây chờ convert** và gần như **0% CPU**.
3. **Chia tập ảo (Virtual Chapters) trên một luồng duy nhất:**
   * Tuyệt đối không cắt file âm thanh. Mọi tập chỉ là các mốc thời gian `[startSec, endSec]` lưu trong DB.
   * **Lợi ích sống còn trên iOS:** Khi đang tắt màn hình, iOS chặn lệnh chuyển sang file `src` mới. Vì tất cả các tập nằm trên cùng một `src`, chuyển tập chỉ đơn giản là gán lại `audio.currentTime = nextChapter.startSec` — chạy xuyên suốt không bị ngắt.

---

## 2. Kiến trúc hệ thống tổng thể

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React / Next / Web)                   │
│                                                                         │
│  [UI Cũ: Tua, Tốc độ, Danh sách tập, Lịch sử]                           │
│           │                                                             │
│           ▼                                                             │
│  [Audio Controller Adapter] ◄──► [Virtual Chapter Engine]               │
│           │                               │                             │
│           ▼                               ▼                             │
│  [HTML5 <audio> Element]      [navigator.mediaSession API]              │
│   (src="/api/stream/:id")      (Tên tập, Ảnh bìa, Nút Lockscreen)       │
└───────────┼───────────────────────────────┬─────────────────────────────┘
            │ HTTP Range Request            │ API Metadata & History
            ▼ (HTTPS qua Cloudflare Tunnel) ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                HOME SERVER (Acer Aspire 5733Z - Debian Linux)           │
│                                                                         │
│  [Backend API (Node.js/Express)]                                        │
│    ├── /api/stories, /api/history ──► [SQLite / MongoDB] (Lưu KB text)  │
│    └── /api/stream/:videoId                                             │
│          ├── 1. Kiểm tra RAM Cache lấy Direct Audio URL (TTL ~4 tiếng)  │
│          ├── 2. Nếu hết hạn -> Gọi youtubei.js / yt-dlp -g trích xuất   │
│          └── 3. Pipe Stream (HTTP 206 Partial Content) ──► Client       │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ Fetch từng mảnh nhỏ (Range Header)
                                    ▼
                         [YouTube / GoogleVideo CDN]
```

### Ước tính tiêu thụ tài nguyên thực tế
* **Hệ điều hành (Debian/Ubuntu Server Headless):** ~150 – 250 MB RAM.
* **Backend + Stream Proxy + Cache URL:** ~80 – 150 MB RAM.
* **CPU (Pentium P6200):** ~2 – 10% khi đang stream (không chạy FFmpeg).
* **Ổ cứng (HDD):** **0 MB** cho file audio; chỉ tốn vài MB cho Database.

---

## 3. Thiết kế chi tiết để áp dụng vào dự án có sẵn

### 3.1. Backend: Direct Audio Stream Proxy

#### Tại sao phải Proxy qua Server thay vì đưa thẳng link `googlevideo.com` cho Frontend?
Link audio gốc do YouTube sinh ra bị **khóa theo IP** của máy gửi yêu cầu. Nếu server lấy link rồi gửi cho điện thoại dùng 4G/Wi-Fi khác tải trực tiếp, Google sẽ trả về lỗi `403 Forbidden`. Đứng giữa làm Proxy giúp mọi request đều đi từ cùng một IP của server.

#### Cơ chế Cache URL bắt buộc (Tránh chậm khi tua)
Mỗi lần người dùng kéo thanh tua, trình duyệt sẽ gửi một HTTP Request mới kèm header `Range: bytes=...`.
* **Sai lầm phổ biến:** Cứ mỗi request `/api/stream/:videoId` lại chạy lại `yt-dlp` hoặc `getBasicInfo()` -> cực kỳ chậm và dễ bị YouTube khóa IP vì spam.
* **Cách làm đúng:** Cache cặp `{ videoId -> { audioUrl, mimeType, contentLength, expiresAt } }` trong RAM (Map hoặc LRU Cache) với thời gian sống khoảng **3–4 tiếng** (link YouTube thường sống ~6 tiếng). Khi tua, server chỉ đọc từ RAM Cache mất <1ms và gọi thẳng `fetch(audioUrl, { headers: { Range } })`.

#### Yêu cầu bắt buộc để iOS Safari phát được Audio
iOS Safari cực kỳ khắt khe: trước khi phát, nó sẽ gửi một request thăm dò `Range: bytes=0-1`. Server **BẮT BUỘC** phải:
1. Trả về HTTP Status `206 Partial Content` (khi có header `Range`).
2. Đầy đủ 4 header: `Content-Type` (ưu tiên `audio/mp4` cho độ tương thích tuyệt đối với iOS), `Content-Length`, `Content-Range`, và `Accept-Ranges: bytes`.
3. Xử lý đóng kết nối (AbortController) khi client ngắt/tua để không bị rò rỉ băng thông và RAM trên server.

#### Khung code minh họa Backend (Node.js)
```javascript
// Minh họa luồng Stream Proxy + URL Cache + Abort Handling
const urlCache = new Map(); // Key: videoId -> { url, mimeType, expiresAt }

async function getCachedAudioStreamInfo(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached;
  }

  // Dùng youtubei.js hoặc yt-dlp lấy luồng audio ưu tiên audio/mp4 (m4a) để iOS hỗ trợ tốt nhất
  const info = await extractYoutubeAudioFormat(videoId); 
  const record = {
    url: info.url,
    mimeType: info.mimeType || "audio/mp4",
    expiresAt: Date.now() + 4 * 60 * 60 * 1000, // Cache 4 tiếng
  };
  urlCache.set(videoId, record);
  return record;
}

app.get("/api/stream/:videoId", async (req, res) => {
  const { videoId } = req.params;
  const controller = new AbortController();

  // Hủy luồng tải từ Google ngay lập tức nếu user tua hoặc tắt tab
  req.on("close", () => controller.abort());

  try {
    const { url, mimeType } = await getCachedAudioStreamInfo(videoId);
    const upstreamHeaders = {};
    if (req.headers.range) {
      upstreamHeaders["Range"] = req.headers.range;
    }

    const upstream = await fetch(url, {
      headers: upstreamHeaders,
      signal: controller.signal,
    });

    // Nếu link hết hạn sớm (403/410) -> Xóa cache để lần gọi sau tự lấy mới
    if (upstream.status === 403 || upstream.status === 410) {
      urlCache.delete(videoId);
      return res.status(502).send("Stream URL expired, please retry");
    }

    const responseHeaders = {
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
    };
    if (upstream.headers.get("content-length")) {
      responseHeaders["Content-Length"] = upstream.headers.get("content-length");
    }
    if (upstream.headers.get("content-range")) {
      responseHeaders["Content-Range"] = upstream.headers.get("content-range");
    }

    res.writeHead(upstream.status, responseHeaders);

    // Pipe stream không lưu RAM/HDD
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) {
        await new Promise((resolve) => res.once("drain", resolve)); // Chống tràn RAM (Backpressure)
      }
    }
    res.end();
  } catch (err) {
    if (err.name !== "AbortError") {
      res.status(500).end();
    }
  }
});
```

> **Lưu ý chống chặn Bot YouTube:** Nếu dùng IP nhà (Residential IP của laptop tại nhà) sẽ **ít bị YouTube chặn hơn rất nhiều** so với IP Datacenter của VPS. Nếu vẫn gặp lỗi `"Sign in to confirm you're not a bot"`, hãy xuất file `cookies.txt` từ một tài khoản Google phụ và cấu hình cho `yt-dlp` / `youtubei.js` (kèm PO Token nếu cần).

---

### 3.2. Database: Schema tối giản cho Truyện, Tập ảo & Lịch sử

Dù dùng SQLite hay MongoDB, cấu trúc dữ liệu chỉ xoay quanh 3 thực thể:

```json
// 1. Story (Truyện)
{
  "id": "story_01",
  "youtubeVideoId": "dQw4w9WgXcQ",
  "title": "Tên Bộ Truyện Audio",
  "author": "Tên Tác Giả / Kênh",
  "coverUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "totalDurationSec": 36000,
  "chapters": [
    { "index": 1, "title": "Tập 1: Khởi đầu", "startSec": 0, "endSec": 3600 },
    { "index": 2, "title": "Tập 2: Hành trình", "startSec": 3600, "endSec": 7200 }
  ]
}

// 2. PlaybackHistory (Tiến độ nghe)
{
  "storyId": "story_01",
  "currentChapterIndex": 2,
  "globalPositionSec": 4125,     // Giây thực tế trên toàn bộ file 10 tiếng
  "playbackRate": 1.25,          // Nhớ luôn tốc độ nghe ưa thích
  "updatedAt": "2026-11-25T10:30:00Z"
}
```

**Hai cách tạo danh sách `chapters` tự động khi Import link YouTube:**
1. **Parse từ mô tả video (Description):** Dùng Regex quét các mốc thời gian dạng `00:00`, `1:25:30` trong phần mô tả hoặc dữ liệu `chapters` có sẵn của YouTube.
2. **Chia đều tự động (Fallback):** Nếu video không có mốc thời gian, cho phép người dùng chọn thời lượng mỗi tập (ví dụ: 30, 45 hoặc 60 phút) rồi tự sinh mảng `[{ startSec, endSec }]`.

---

### 3.3. Frontend: Refactor từ YouTube Iframe sang HTML5 Audio

#### Chiến lược Refactor không đập đi xây lại UI (Adapter Pattern)
Giữ nguyên toàn bộ giao diện hiện có (nút Play/Pause, thanh seekbar, nút 1.25x/1.5x, danh sách tập). Chỉ thay lớp điều khiển bên dưới:

| Hành động UI | Cách cũ (YouTube Iframe API) | Cách mới (HTML5 `<audio>`) |
| :--- | :--- | :--- |
| Phát / Dừng | `player.playVideo()` / `pauseVideo()` | `audio.play()` / `audio.pause()` |
| Tua đến giây X | `player.seekTo(sec, true)` | `audio.currentTime = sec` |
| Đổi tốc độ | `player.setPlaybackRate(1.5)` | `audio.playbackRate = 1.5` |
| Lấy giây hiện tại | `player.getCurrentTime()` (polling) | Sự kiện `timeupdate` -> `audio.currentTime` |
| Chuyển tập ảo | `player.seekTo(chap.startSec)` | `audio.currentTime = chap.startSec` (giữ nguyên `src`) |

#### Tích hợp Media Session API (Chìa khóa nghe khi tắt màn hình)
Mỗi khi người dùng bấm Play hoặc chuyển sang tập ảo mới, gọi hàm đồng bộ `navigator.mediaSession`:
* **`metadata`:** Đẩy `title` (tên tập), `artist` (tên truyện), `artwork` (ảnh bìa).
* **`setPositionState`:** Tính thời lượng và vị trí **theo từng tập ảo** (`duration = endSec - startSec`, `position = audio.currentTime - startSec`) để thanh tiến trình trên màn hình khóa hiển thị đúng thời gian của tập đang nghe thay vì hiện 10 tiếng.
* **`setActionHandler`:** Đăng ký `play`, `pause`, `seekbackward`, `seekforward`, `seekto`, `previoustrack`, `nexttrack`.
* **Lưu ý iOS:** Màn hình khóa iOS thường ưu tiên hiển thị 1 cặp nút (tua ±15s hoặc chuyển tập). Nếu muốn ưu tiên nút chuyển tập trên màn hình khóa iPhone, hãy gán `null` cho `seekbackward` và `seekforward`.

#### Cơ chế tự phục hồi khi Stream bị ngắt / Link hết hạn (Auto-Recovery)
Nếu người dùng nghe liên tục qua mốc 4–6 tiếng hoặc chuyển từ Wi-Fi sang 4G khiến kết nối stream bị đứt:
1. Lắng nghe sự kiện `error` trên thẻ `<audio>`.
2. Lưu ngay vị trí hiện tại `lastTime = audio.currentTime`.
3. Gắn thêm query param chống cache (ví dụ `/api/stream/${videoId}?retry=${Date.now()}`) vào `audio.src`, gọi `audio.load()`.
4. Trong sự kiện `loadedmetadata`, gán lại `audio.currentTime = lastTime` và gọi `audio.play()`.

#### Lưu lịch sử nghe tối ưu (Không spam server)
* Lưu ngay vào `localStorage` mỗi **3–5 giây** (trong sự kiện `timeupdate` có throttle).
* Đồng bộ lên Backend Database mỗi **15–30 giây**, và gửi ngay lập tức khi có sự kiện `pause`, `visibilitychange` (người dùng thoát ra màn hình chính), hoặc `pagehide` (dùng `navigator.sendBeacon`).

---

## 4. Lộ trình Refactor từng bước cho dự án hiện tại

1. **Bước 1 — Dựng API Proxy độc lập:**
   * Viết endpoint `GET /api/extract?url=...` (lấy metadata + danh sách tập) và `GET /api/stream/:videoId`.
   * Test trực tiếp bằng cách mở link `https://domain-cua-ban/api/stream/VIDEO_ID` trên trình duyệt điện thoại (iOS/Android), kiểm tra xem có phát tiếng, tua được và tắt màn hình vẫn chạy không.
2. **Bước 2 — Hoán đổi Engine ở Frontend:**
   * Gỡ bỏ thư viện/thẻ YouTube `<iframe>`.
   * Gắn thẻ `<audio preload="metadata">` và nối các hàm `play`, `pause`, `seek`, `playbackRate` vào UI hiện tại.
3. **Bước 3 — Gắn Logic Tập ảo & Media Session:**
   * Map thanh kéo (seekbar) của UI theo mốc `[chapter.startSec, chapter.endSec]`.
   * Trong `timeupdate`, kiểm tra nếu `audio.currentTime >= currentChapter.endSec` thì tự động cập nhật state sang tập tiếp theo và cập nhật lại `navigator.mediaSession.metadata`.
4. **Bước 4 — Hoàn thiện trải nghiệm App:**
   * Bổ sung cơ chế Auto-Recovery khi rớt mạng/hết hạn link.
   * Thêm file `manifest.json` (PWA) để có thể "Thêm vào màn hình chính" (Add to Home Screen) chạy toàn màn hình như app native.

---

## 5. Checklist triển khai trên Acer Aspire 5733Z (2GB RAM)

Để chiếc laptop đời cũ chạy ổn định 24/7 làm server miễn phí:

* **Hệ điều hành:** Cài **Debian 12 (netinst)** hoặc **Ubuntu Server LTS** (bản không có giao diện desktop) để giữ RAM hệ thống dưới 200MB.
* **Tắt ngủ khi gập màn hình:**
  Chỉnh file `/etc/systemd/logind.conf`:
  ```ini
  HandleLidSwitch=ignore
  HandleLidSwitchExternalPower=ignore
  HandleLidSwitchDocked=ignore
  ```
  Sau đó chạy `sudo systemctl restart systemd-logind`. Thêm `consoleblank=60` vào cấu hình GRUB để tự tắt đèn nền màn hình sau 60 giây.
* **Mạng & HTTPS bắt buộc (Cloudflare Tunnel):**
  * Cắm dây **LAN** thay vì Wi-Fi để tránh rớt mạng và tăng độ ổn định khi tua stream.
  * Dùng **Cloudflare Tunnel (`cloudflared`)** để trỏ domain có sẵn về máy tại nhà. Không cần mở port router, không lo đổi IP động từ nhà mạng, và **tự động có HTTPS miễn phí** (điều kiện bắt buộc để `navigator.mediaSession` hoạt động).
* **Quản lý tiến trình & chống tràn RAM:**
  * Tạo thêm **2GB Swap** trên ổ cứng để dự phòng tình huống đột biến RAM.
  * Chạy ứng dụng bằng **PM2** kèm cờ giới hạn bộ nhớ tự khởi động lại nếu rò rỉ RAM:
    ```bash
    pm2 start server.js --name audiobook-app --max-memory-restart 500M
    ```

---

## 6. Hướng mở rộng tương lai (Nếu cần chống xóa video)

Kiến trúc trên hoàn hảo nếu video YouTube ổn định. Trong trường hợp sau này bạn gặp các bộ truyện hay bị chủ kênh xóa/đánh bản quyền, có thể nâng cấp lên **mô hình Hybrid (Không cần đổi code Frontend)**:
* Người dùng vẫn nghe ngay tức thì bằng **Direct Audio Stream Proxy**.
* Backend chạy một hàng đợi ngầm (background queue) tải thẳng file audio gốc `.m4a`/`.opus` (không convert MP3) rồi đẩy lên:
  * **Cloudflare R2 (Gói Free 10GB, miễn phí băng thông egress):** Chứa được ~700 giờ truyện ở bitrate giọng nói, tốc độ tua cực nhanh.
  * **Hoặc Telegram Private Channel (dùng MTProto — GramJS/Pyrogram):** Lưu trữ không giới hạn dung lượng, cập nhật endpoint `/api/stream/:id` để tự động chuyển nguồn sang đọc từ Telegram nếu link YouTube bị die.