# WAVELINK MOBILE (REACT NATIVE ANDROID SHELL)

Module độc lập dành cho Android, tích hợp **Bong bóng phát nổi (Floating Bubble Overlay)** và **Picture-in-Picture (PiP)**, giúp giải quyết triệt để vấn đề iframe YouTube bị tắt khi thoát app hoặc tắt màn hình.

---

## 🌟 Tính năng Nổi bật

1. **Bong bóng phát nổi (Floating Bubble Overlay)**:
   - Sử dụng Android `WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY`.
   - Hiển thị hình tròn 64dp với ảnh bìa bài hát xoay đĩa than mượt mà.
   - Nút Play/Pause nhanh ngay trên bong bóng.
   - Kéo thả tự do bất kỳ đâu trên màn hình.
   - Tự động hút nam châm dính vào mép trái/phải màn hình (Snap to edge 60fps).
   - Kéo xuống đáy màn hình (Vùng biểu tượng thùng rác màu đỏ) có phản hồi rung (Haptic feedback) để đóng bong bóng và dừng phát.
   - Chạm 1 chạm vào bong bóng để phóng to mở lại toàn màn hình WaveLink.

2. **Chế độ Picture-in-Picture (PiP) Tự Động (Fallback)**:
   - Nếu người dùng chưa cấp quyền "Vẽ lên trên ứng dụng khác" (`SYSTEM_ALERT_WINDOW`), hệ thống sẽ **tự động kích hoạt PiP** khi người dùng bấm Home thoát app.
   - Không yêu cầu cấp quyền đặc biệt, tương thích ngay từ Android 8.0 (API 26) trở lên.

3. **Android Foreground Service (`FOREGROUND_SERVICE_MEDIA_PLAYBACK`)**:
   - Duy trì tiến trình ứng dụng ở mức ưu tiên cao nhất, ngăn chặn Low Memory Killer (LMK) của Android tắt tiến trình khi máy thiếu RAM.
   - Tích hợp `PowerManager.PARTIAL_WAKE_LOCK` để CPU không đi vào Deep Sleep khi tắt màn hình.
   - Hiển thị Media Notification trên thanh trạng thái và màn hình khóa.

4. **Two-Way Bridge (Cầu nối Hai Chiều) Độc Lập**:
   - `frontend/src/lib/mobileBridge.ts` tự động phát hiện môi trường `window.ReactNativeWebView`.
   - Đồng bộ trạng thái bài hát, thumbnail, play/pause giữa Web Store (Zustand) và Mobile Native.
   - Khi chạy trên trình duyệt web máy tính hay điện thoại thông thường, module này tự động tắt, không làm ảnh hưởng đến code cũ.

---

## 📁 Cấu trúc Thư mục Module `mobile/`

```text
mobile/
├── package.json                   # Dependencies riêng của React Native
├── app.json                       # Tên ứng dụng WaveLink
├── src/
│   ├── App.tsx                    # WebView Shell, quản lý AppState & Permission Modal
│   ├── config/
│   │   └── appConfig.ts           # URL kết nối Web (Local 10.0.2.2 hoặc Production)
│   ├── modules/
│   │   ├── FloatingBubble.ts      # TypeScript Wrapper cho Native FloatingBubbleModule
│   │   ├── PictureInPicture.ts    # TypeScript Wrapper cho Native PictureInPictureModule
│   │   └── ForegroundAudioService.ts # Wrapper cho Foreground Service
│   └── components/
│       └── PermissionModal.tsx    # Dialog xin quyền thân thiện, giải thích lý do cần thiết
└── android/
    ├── app/
    │   ├── src/main/
    │   │   ├── AndroidManifest.xml # Quyền SYSTEM_ALERT_WINDOW, FOREGROUND_SERVICE...
    │   │   ├── res/
    │   │   │   ├── layout/        # layout_floating_bubble.xml, layout_bubble_trash.xml
    │   │   │   └── drawable/      # bg_bubble_circle.xml, bg_trash_circle.xml
    │   │   └── java/com/wavelink/mobile/
    │   │       ├── MainActivity.kt # Tự động vào PiP khi thoát app (onUserLeaveHint)
    │   │       ├── MainApplication.kt
    │   │       ├── WavelinkPackage.kt
    │   │       ├── bubble/        # FloatingBubbleModule & FloatingBubbleService
    │   │       ├── pip/           # PictureInPictureModule
    │   │       └── service/       # ForegroundAudioService
```

---

## 🚀 Hướng dẫn Cài đặt & Chạy Thử nghiệm

### 1. Chuẩn bị Môi trường
- Đã cài đặt **Android Studio** và **Android SDK (API 34)**.
- Biến môi trường `ANDROID_HOME` đã được trỏ đúng đến thư mục Android SDK.
- Thiết bị thật đã bật `USB Debugging` hoặc máy ảo Android Emulator đang chạy.

### 2. Khởi chạy Ứng dụng

**Bước 1: Chạy Frontend Web (ở Terminal 1):**
```bash
npm --prefix frontend run dev
```

**Bước 2: Cài đặt dependencies cho mobile (lần đầu tiên):**
```bash
cd mobile
npm install
```

**Bước 3: Khởi chạy Metro Bundler (ở Terminal 2):**
```bash
cd mobile
npm start
```

**Bước 4: Chạy app lên thiết bị Android (ở Terminal 3):**
```bash
cd mobile
npm run android
```

### 3. Đóng gói file APK Release
```bash
cd mobile/android
./gradlew assembleRelease
```
File APK hoàn chỉnh sẽ nằm tại:
`mobile/android/app/build/outputs/apk/release/app-release.apk`

---

## ⚙️ Lưu ý khi Kiểm thử trên các dòng máy Android

- **Xiaomi (MIUI / HyperOS)**: Cần vào `Cài đặt > Ứng dụng > Quản lý ứng dụng > WaveLink > Quyền khác` $\rightarrow$ Cho phép mục **"Hiển thị cửa sổ pop-up khi chạy nền"**.
- **Samsung One UI**: Khi có hộp thoại cấp quyền, chọn bật mục **"Xuất hiện trên cùng" (Appear on top)**.
- Nếu người dùng từ chối quyền, WaveLink sẽ tự động thu nhỏ thành khung **Picture-in-Picture (PiP)** mượt mà mà không bắt buộc người dùng thao tác lại.
