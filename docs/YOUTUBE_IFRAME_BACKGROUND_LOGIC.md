# 📘 Cơ Chế & Logic Hoạt Động Của YouTube IFrame Khi Chạy Nền Trong WaveLink

> **Tài liệu kỹ thuật giải thích nguyên nhân, luồng xử lý và giải pháp cho tính năng phát âm thanh nền từ YouTube IFrame trong WaveLink Mobile (APK).**  
> **Ngày lập:** 05/11/2026  
> **Dự án:** WaveLink Audio App (Web + React Native Android Hybrid Shell)

---

## 1. Bản Chất Của Vấn Đề

Bạn nhận định rất chính xác: **Về mặt kỹ thuật và chính sách của Google, YouTube IFrame KHÔNG cho phép phát trong nền (Background Playback)**.

Hiện tượng bạn quan sát được:
1. Khi đang nghe trong app: Âm thanh phát bình thường.
2. Khi bấm nút Home hoặc vuốt thoát app: **Âm thanh lập tức bị ngắt**, mặc dù trên màn hình vẫn có Bong bóng phát nổi.
3. Khi bấm quay trở lại app: **Âm thanh tự động phát tiếp**.

Để hiểu tại sao lại có hiện tượng này, chúng ta cần bóc tách **3 lớp rào cản kỹ thuật** đang đồng thời vận hành bên dưới.

---

## 2. Kiến Trúc 3 Tầng Của Dự Án WaveLink Mobile

```
┌─────────────────────────────────────────────────────────────┐
│                      HỆ ĐIỀU HÀNH ANDROID                   │
├───────────────────────────────┬─────────────────────────────┤
│      TẦNG 1: NATIVE SHELL     │    TẦNG 2: NATIVE SERVICE   │
│  (MainActivity - React Native)│  (FloatingBubbleService)    │
│  ┌─────────────────────────┐  │  ┌───────────────────────┐  │
│  │   Android WebView       │  │  │   Bong Bóng Nổi       │  │
│  │  ┌───────────────────┐  │  │  │   (WindowManager)     │  │
│  │  │ WaveLink Web App  │  │  │  │   • Thumbnail xoay    │  │
│  │  │ ┌───────────────┐ │  │  │  │   • Nút Play/Pause    │  │
│  │  │ │YouTube IFrame │ │  │  │  │   (Chỉ là UI hiển thị)│  │
│  │  │ └───────────────┘ │  │  │  └───────────────────────┘  │
│  │  └───────────────────┘  │  │                             │
│  └─────────────────────────┘  │                             │
└───────────────────────────────┴─────────────────────────────┘
```

* **Tầng 1 (MainActivity):** Chứa WebView đang nạp trang web WaveLink. Mọi logic phát nhạc, bao gồm thẻ `<iframe>` của YouTube, đều nằm hoàn toàn bên trong WebView này.
* **Tầng 2 (FloatingBubbleService):** Là một Android Service độc lập, dùng quyền `SYSTEM_ALERT_WINDOW` để vẽ một vòng tròn nhỏ lên trên màn hình điện thoại (tương tự bong bóng chat Messenger). **Bong bóng này hoàn toàn KHÔNG chứa trình phát YouTube**, nó chỉ là một lớp giao diện (UI) hiển thị ảnh thu nhỏ và gửi lệnh điều khiển.

---

## 3. Tại Sao Khi Thoát App Thì Video/Audio Lại Ngừng?

Khi bạn nhấn nút **Home** hoặc chuyển sang ứng dụng khác, một chuỗi phản ứng liên hoàn xảy ra qua **3 lớp kiểm soát**:

```
[Người dùng bấm Home / Thoát App]
                ↓
    (1) Android OS gửi sự kiện onPause() / onStop() tới MainActivity
                ↓
    (2) Trình duyệt Chromium trong WebView kích hoạt:
        document.visibilityState = 'hidden'
        document.hidden = true
                ↓
    (3) Script nội bộ của YouTube (https://www.youtube.com/embed/...)
        lắng nghe thấy visibilitychange: hidden
                ↓
    (4) YouTube Player TỰ ĐỘNG THỰC THI: pauseVideo()
        (Để bảo vệ tính năng trả phí YouTube Premium)
                ↓
    (5) Âm thanh bị ngắt hoàn toàn!
```

### Chi tiết 3 lớp rào cản:

### Lớp 1: Hệ điều hành Android (Activity Lifecycle)
Khi bạn thoát app, `MainActivity` (nơi giữ WebView) bị Android chuyển từ trạng thái `Resumed` sang `Paused` rồi `Stopped`. Hệ điều hành bắt đầu hạ độ ưu tiên CPU của tiến trình này.

### Lớp 2: Trình duyệt Chromium WebView (Page Visibility API)
WebView sử dụng nhân Chromium. Khi Activity bị che khuất hoặc ẩn đi, Chromium tuân thủ nghiêm ngặt tiêu chuẩn W3C:
* Phát sự kiện `visibilitychange` với `document.visibilityState = 'hidden'`.
* Đóng băng (throttling) bộ đếm thời gian JavaScript (`setTimeout`, `setInterval`).
* Tự động đình chỉ bộ giải mã media (Media Decoder Suspend) để tiết kiệm pin nếu view không còn nằm trên màn hình hiển thị.

### Lớp 3: Trình phát YouTube IFrame API (Chính sách bản quyền của Google)
Đây là rào cản **nghiêm ngặt nhất**:
* Phát video tắt màn hình hoặc chạy ngầm là **tính năng độc quyền của YouTube Premium / YouTube Music**.
* Vì vậy, mã nguồn JavaScript bên trong iframe YouTube (tải từ máy chủ Google `youtube.com/s/player/...`) được lập trình sẵn một cơ chế bảo vệ: **Bất cứ khi nào phát hiện trang bị ẩn (`document.hidden === true`), nó sẽ tự động kích hoạt hàm `pauseVideo()`**.
* Dù ứng dụng của bạn có Background Service giữ CPU không ngủ (`WakeLock`), thì chính bản thân mã nguồn của YouTube đã chủ động gửi lệnh dừng phát.

---

## 4. Tại Sao Khi Mở Lại App Thì Nhạc Lại Tự Động Phát Tiếp?

Hiện tượng *"vào lại app thì nhạc tự phát tiếp"* xảy ra là do trong mã nguồn của WaveLink Web (`frontend/src/components/layout/YouTubeEngineHost.tsx`), lập trình viên đã viết sẵn bộ lắng nghe sự kiện phục hồi:

```typescript
// Trích đoạn thực tế trong YouTubeEngineHost.tsx (Dòng 228 - 237):
const handleVisibilityChange = () => {
  const store = usePlayerStore.getState();

  if (document.hidden) {
    // Khi thoát app: Ghi nhận trạng thái đang phát dở
  } else {
    // KHI QUAY TRỞ LẠI APP:
    // Kiểm tra nếu trước đó người dùng đang nghe dở mà không chủ động bấm Pause
    if (store.isPlaying && !store.isExplicitlyPaused && playerRef.current) {
      try {
        const ytState = playerRef.current.getPlayerState?.();
        if (ytState !== 1) { // 1 = YT.PlayerState.PLAYING
          // TỰ ĐỘNG GỌI LỆNH PHÁT TIẾP TỤC!
          playerRef.current.playVideo();
        }
      } catch {}
    }
  }
};

document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('focus', handleWindowFocus);
```

**Giải thích luồng:**
1. Khi bạn mở lại APK, `MainActivity` quay lại Foreground (`onResume`).
2. Trình duyệt chuyển trạng thái `document.visibilityState = 'visible'`.
3. Đoạn mã trên bắt được sự kiện, kiểm tra thấy biến cờ `isExplicitlyPaused === false` (người dùng không hề ấn dừng, mà do hệ thống tự ngắt).
4. Ngay lập tức nó gọi hàm `player.playVideo()` để kích hoạt lại trình phát YouTube!

---

## 5. So Sánh: Bong Bóng Nổi (Floating Bubble) vs Picture-in-Picture (PiP)

Rất nhiều người lầm tưởng rằng chỉ cần làm "Bong bóng nổi" là âm thanh sẽ phát được. Bảng so sánh dưới đây giải thích sự khác biệt cốt lõi:

| Tiêu chí | Bong bóng nổi (Floating Bubble / WindowManager) | Thu nhỏ màn hình (Picture-in-Picture - PiP) |
|---|---|---|
| **Cơ chế hoạt động** | Tạo 1 Android Service vẽ ảnh nổi đè lên màn hình. `MainActivity` bên dưới **bị ẩn/dừng (`onStop`)**. | Toàn bộ `MainActivity` co nhỏ thành 1 khung hình chữ nhật ở góc màn hình. |
| **Trạng thái Activity** | 🛑 **STOPPED / HIDDEN** | 🟢 **RESUMED / VISIBLE** |
| **Trạng thái IFrame YouTube** | Nhận diện tab bị ẩn → **Tự động ngắt âm thanh**. | Nhận diện khung hình vẫn đang chiếu → **Phát liên tục không dừng**. |
| **Tương thích YouTube ToS** | Bị YouTube chặn vì vi phạm tính năng Premium. | **Được hỗ trợ chính thức** theo chuẩn Android 8.0+. |
| **Trải nghiệm người dùng** | Gọn nhẹ, hình tròn đẹp mắt, kéo thả dễ dàng. | Là một khung chữ nhật nhỏ, có thể xem được cả hình hoặc ẩn vào mép. |

> 👉 **Kết luận:** Bong bóng nổi dạng overlay đơn thuần chỉ có tác dụng tạo nút điều khiển nhanh bên ngoài màn hình, **không thể giữ cho iframe YouTube tiếp tục phát âm thanh** nếu bản thân WebView bị Android đưa vào trạng thái dừng!

---

## 6. Các Hướng Giải Pháp Kỹ Thuật Để Chạy Nền Thực Thụ

Để giải quyết bài toán phát âm thanh nền từ YouTube trong ứng dụng di động, hiện nay trong ngành có **3 giải pháp chính**:

---

### Phương Án 1: Sử Dụng Picture-in-Picture (PiP) Làm Trọng Tâm (Khuyên Dùng Nhất Cho IFrame)
* **Cách thực hiện:** Khi người dùng bấm Home thoát app, thay vì chỉ hiện bong bóng và để `MainActivity` dừng lại, ứng dụng lập tức gọi:
  ```kotlin
  enterPictureInPictureMode(PictureInPictureParams.Builder().build())
  ```
* **Ưu điểm:**
  * 100% video và audio YouTube tiếp tục phát bình thường không hề bị ngắt 1 giây nào.
  * Tuân thủ hoàn toàn chính sách Android và YouTube IFrame API.
  * Người dùng có thể kéo khung video PiP nhỏ xuống góc màn hình hoặc vuốt sát vào mép để nghe tiếng như một podcast.

---

### Phương Án 2: Kỹ Thuật Đánh Lừa Page Visibility & Chống Đóng Băng WebView (Workaround)
Nếu vẫn muốn duy trì chế độ Bong bóng nổi và ẩn hoàn toàn cửa sổ app:
* **Bước 1 (Native Android):** Trong `MainActivity.kt`, không cho phép gọi `webView.onPause()`, giữ WebView luôn trong chế độ hoạt động:
  ```kotlin
  override fun onPause() {
      super.onPause()
      // KHÔNG gọi webView.onPause() để tránh Chromium đóng băng Audio/Video
  }
  ```
* **Bước 2 (Tiêm JavaScript giả mạo Page Visibility):**
  Tiêm đoạn mã ghi đè thuộc tính hiển thị trước khi YouTube IFrame nạp:
  ```javascript
  Object.defineProperty(document, 'hidden', { get: () => false });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
  document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
  ```
* **Bước 3 (Chống lệnh pause tự động của HTML5 Video):**
  Can thiệp vào prototype của HTMLMediaElement trong WebView:
  ```javascript
  const originalPause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function() {
    if (window.__isUserPausing__) {
      originalPause.apply(this, arguments);
    } else {
      console.log('Chặn YouTube tự ý pause khi chạy nền!');
    }
  };
  ```
* **Đánh giá:** Phương án này có thể lách được kiểm tra của YouTube trong một số phiên bản, nhưng có thể kém ổn định khi Android quản lý tiết kiệm pin chặt chẽ (Doze Mode trên Android 13/14).

---

### Phương Án 3: Kiến Trúc Native Audio Engine (Giải Pháp Của NewPipe / Pure Tuber)
Nếu muốn phát âm thanh nền hoàn hảo như Spotify / Zing MP3 (tắt hẳn màn hình, không cần khung hình, không phụ thuộc vào IFrame):
* **Kiến trúc:** 
  1. Thay vì dùng `<iframe>` của YouTube, ứng dụng gọi Backend để trích xuất link stream âm thanh thuần túy (`.m4a` / `webm audio stream`).
  2. Nạp luồng stream âm thanh này vào thư viện **`react-native-track-player`** (chạy bằng **Android ExoPlayer** nguyên bản).
  3. ExoPlayer gắn với một **Foreground Media Service**, phát âm thanh thực thụ qua Android AudioTrack.
* **Ưu điểm:** Phát nền 24/7, tắt màn hình thoải mái, tích hợp widget âm thanh màn hình khóa, tốn cực ít pin và RAM.
* **Nhược điểm:** Cần server backend phân giải stream YouTube (dùng `yt-dlp` hoặc API tương đương), không dùng iframe nhúng trực tiếp.

---

## 7. Tổng Kết Kiến Trúc Cho WaveLink

1. **Vấn đề cốt lõi:** Iframe YouTube bị dừng khi thoát app là do cơ chế **bảo vệ bản quyền YouTube Premium của Google** kích hoạt khi nhận diện tab bị ẩn (`document.hidden = true`), kết hợp với việc **Android dừng Activity** khi người dùng thoát ra ngoài.
2. **Bong bóng nổi:** Đóng vai trò là Widget điều khiển nổi trên màn hình, giúp giữ Service chạy ngầm, nhưng cần kết hợp cơ chế chống đóng băng WebView hoặc PiP để âm thanh bên trong không bị tắt.
3. **Giải pháp tối ưu nhất cho phiên bản hiện tại:** 
   * **Kích hoạt Picture-in-Picture (PiP)** khi thoát app để giữ luồng video/audio phát liên tục 100%.
   * Kết hợp **Foreground Service + PARTIAL_WAKE_LOCK** để CPU không bị rơi vào trạng thái ngủ sâu (Deep Sleep) khi người dùng khóa màn hình.
