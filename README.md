# 🎧 WaveLink — Nền Tảng Nghe Truyện Audio & Sách Nói

**WaveLink** là nền tảng nghe truyện audio, sách nói và podcast dài tập tối ưu cho trình duyệt di động, PWA và Android. Hệ thống tách luồng âm thanh trực tiếp qua Stream Proxy tốc độ cao mà không lưu tệp audio thô trên máy chủ, kết hợp chia tập thông minh, đồng bộ tiến độ 2 chiều, thông báo WebSocket realtime và bộ công cụ quản trị toàn diện.

---

## 📋 Mục Lục

1. [Điểm Nổi Bật & Giá Trị Cốt Lõi](#1-điểm-nổi-bật--giá-trị-cốt-lõi)
2. [Tính Năng Theo Phân Hệ](#2-tính-năng-theo-phân-hệ)
3. [Kiến Trúc & Công Nghệ Sử Dụng](#3-kiến-trúc--công-nghệ-sử-dụng)
4. [Cấu Trúc Thư Mục](#4-cấu-trúc-thư-mục)
5. [Cài Đặt, Chạy Local & Docker](#5-cài-đặt-chạy-local--docker)
6. [Kiểm Thử](#6-kiểm-thử)

---

## 1. Điểm Nổi Bật & Giá Trị Cốt Lõi

- **Phát âm thanh trực tiếp & tiết kiệm dung lượng**: Backend Stream Proxy (`/stream/`) trích xuất và proxy luồng audio theo từng dải byte (HTTP Range) bằng token ký số có thời hạn, không lưu file MP3 trên ổ đĩa server.
- **Tối ưu nghe dài tập & phát nền**: Hỗ trợ phát khi khóa màn hình, điều khiển từ màn hình khóa (MediaSession), hẹn giờ tắt, chọn tốc độ phát, chuyển tập nhanh và tiếp tục đúng giây đang nghe dở.
- **Chia tập thông minh theo mốc thời gian**: Một nội dung dài trên YouTube có thể chia thành nhiều tập kèm tiêu đề, thứ tự tập, trạng thái VIP riêng từng tập và kiểm tra chống chồng lấn thời lượng.
- **Đồng bộ 2 chiều & đa thiết bị**: Tiến độ nghe (`/progress`), lịch sử (`/history`) và danh sách yêu thích (`/favorites`) được đồng bộ qua tài khoản; người nghe có thể chọn đồng bộ về YouTube hoặc giữ độc lập.
- **Thông báo WebSocket Realtime**: Đẩy thông báo tức thì theo từng người dùng khi có truyện/tập mới, thay đổi trạng thái VIP hoặc thông báo hệ thống, đồng bộ với thông báo nền qua Service Worker.

---

## 2. Tính Năng Theo Phân Hệ

### 🎧 Dành Cho Người Nghe
- **Trang chủ (`/home`) & Thư viện (`/library`)**: Tìm kiếm theo tên, tác giả, thể loại, tag; lọc nhanh truyện dài/ngắn, mục nghe tiếp và danh sách yêu thích.
- **Trình phát chuyên biệt (`/player/:id`)**: Thanh tua tập, điều chỉnh tốc độ, hẹn giờ ngủ, chuyển tập trước/sau, đánh dấu tập đã nghe và giữ trình phát thu gọn khi duyệt trang khác.
- **Nhập link YouTube (`/upload`)**: Dán link video YouTube để tự động lấy metadata và thêm vào thư viện cá nhân/cộng đồng theo hạn mức cấu hình động từ hệ thống.
- **Hồ sơ & Cài đặt (`/profile`, `/settings`)**: Theo dõi thời lượng nghe, quản lý lịch sử và tùy chỉnh nhận từng nhóm thông báo.

### 💬 Cộng Đồng & Thông Báo Realtime
- **Kênh Cộng Đồng (`/community`)**: Trao đổi, đề xuất truyện hoặc thảo luận theo thời gian thực; hỗ trợ kiểm soát quyền chat khách theo cấu hình quản trị (`allowGuestChat`).
- **Hộp thư thông báo (`/notifications`)**:
  - Kết nối WebSocket riêng theo tài khoản (`/api/v1/notifications/ws`).
  - Lọc nhanh theo trạng thái và phân loại: `Tất cả`, `Chưa đọc`, `Audio mới`, `VIP`, `Hệ thống`.
  - Hỗ trợ thông báo trình duyệt/OS qua Service Worker (`frontend/public/sw.js`) điều hướng thẳng tới `/player/:id` hoặc `/notifications`.
  - Chống gửi trùng thông báo liên tiếp và tôn trọng tùy chọn tắt/bật của từng người dùng.

### 👑 Hội Viên VIP & Thanh Toán (`/membership`)
- **Các gói hội viên**: 30 ngày (`49.000đ`), 90 ngày (`129.000đ`), 365 ngày (`399.000đ`).
- **Thanh toán PayOS & VietQR**: Tạo mã QR/liên kết thanh toán có thời hạn 15 phút, tự động đối soát trạng thái đơn hàng, kích hoạt VIP ngay khi thanh toán thành công và có tiến trình nền tự động quét đơn/gói hết hạn mỗi 60 giây.
- **Hỗ trợ & Hoàn tiền**: Người dùng có thể gửi yêu cầu hỗ trợ hoặc khiếu nại đơn hàng trực tiếp để tạo ticket cho bộ phận quản trị xử lý.

### 🛡️ Khu Vực Quản Trị Admin (`/admin/*` — Tối ưu Mobile-First)
Giao diện quản trị được thiết kế ưu tiên thao tác một chạm trên điện thoại và máy tính bảng với 11 phân khu chuyên sâu:
- **Tổng quan (`/admin`)**: Thống kê người dùng, audio, doanh thu, đơn hàng và biểu đồ xu hướng 14 ngày.
- **Tài khoản (`/admin/users`)**: Tìm kiếm, lọc, tạo/sửa thông tin, đổi mật khẩu, cấp/thu hồi VIP, khóa/mở khóa (`ban`) kèm chặn JWT tức thì, gửi thông báo riêng và thao tác hàng loạt.
- **Đơn hàng (`/admin/orders`)**: Theo dõi giao dịch PayOS/VietQR, xác nhận thủ công, hủy đơn hoặc đánh dấu hoàn tiền.
- **Gói & Quyền VIP (`/admin/vip`)**: Quản lý danh sách hội viên VIP, gia hạn hoặc điều chỉnh thời hạn trực tiếp.
- **Audio & Import (`/admin/audios`)**: Lọc nội dung, chỉnh sửa metadata/link/thumbnail/thời lượng, import hàng loạt (batch import) và kiểm tra sức khỏe luồng stream hàng loạt.
- **Quản lý Tập (`/admin/episodes`)**: Theo dõi thống kê tập, thêm/sửa chương hàng loạt, tự động sắp xếp lại số tập khi xóa và bật/tắt VIP theo từng tập.
- **Thể loại & Tag (`/admin/categories`)**: Tạo, sửa, ẩn/hiện, gộp thể loại hoặc gộp tag trùng lặp, tự động chuyển audio về thể loại thay thế và dọn tag không còn sử dụng.
- **Cộng đồng (`/admin/community`)**: Kiểm duyệt, ghim/xóa tin nhắn và bật/tắt chat cho tài khoản khách.
- **Ticket Hỗ trợ (`/admin/tickets`)**: Tiếp nhận và xử lý yêu cầu hoàn tiền, khiếu nại thanh toán hoặc góp ý từ người dùng.
- **Gửi thông báo (`/admin/notify`)**: Phát thông báo broadcast tới toàn hệ thống hoặc nhóm người dùng qua hàng đợi realtime.
- **Hệ thống (`/admin/system`)**: Cấu hình động `SiteConfig` (hạn mức import, chế độ chat khách), kiểm tra/xóa Stream URL cache, xem nhật ký thao tác `AdminAuditLog` và xuất dữ liệu CSV.

---

## 3. Kiến Trúc & Công Nghệ Sử Dụng

| Thành phần | Công nghệ chính |
| :--- | :--- |
| **Frontend Web / PWA** | React 18, Vite 6, TypeScript, Tailwind CSS, React Router v6, TanStack Query, Zustand, Service Worker |
| **Backend API** | Go 1.26 (`audio-app-backend`), Gin, GORM, JWT, Gorilla WebSocket |
| **Stream Proxy** | Module `/stream/` tích hợp trong API Server hoặc chạy độc lập qua `cmd/stream` (HTTP Range, signed token, URL cache theo TTL, giới hạn luồng đồng thời) |
| **Cơ sở dữ liệu** | SQLite (local dev) hoặc MySQL (production) |
| **Mobile Android** | React Native Android Shell (`mobile/`) hỗ trợ Foreground Media Service & Floating Bubble Overlay |
| **Thanh toán** | PayOS v2 API & VietQR |

---

## 4. Cấu Trúc Thư Mục

```text
wavelink-audio-app/
├── backend/
│   ├── cmd/
│   │   ├── api/                 # Entrypoint API Server chính + tích hợp /stream/
│   │   └── stream/              # Entrypoint Standalone Stream Proxy
│   ├── config/                  # Đọc biến môi trường & cấu hình hệ thống
│   ├── core/domain/             # Entities & domain models (User, Audio, Episode, Ticket, AuditLog, SiteConfig...)
│   ├── infra/
│   │   ├── db/                  # Kết nối SQLite/MySQL, auto-migration & baseline seed
│   │   └── external/            # Stream extractor & dịch vụ ngoài
│   ├── modules/                 # Các module nghiệp vụ: auth, audio, episode, taxonomy,
│   │                            # membership, notification, community, admin, stream
│   └── server/                  # Gin router, static SPA fallback & auth/ban middleware
├── frontend/
│   ├── public/                  # Tài nguyên tĩnh & Service Worker (sw.js)
│   └── src/
│       ├── views/               # Các trang người dùng & 11 trang quản trị Admin
│       ├── components/          # UI components dùng chung & AdminUI
│       ├── hooks/               # Custom hooks (useNotifications, player hooks...)
│       ├── services/            # API clients & WebSocket/external notification services
│       ├── stores/              # Zustand state stores
│       └── test/                # Bộ test Vitest & Testing Library
├── mobile/                      # React Native Android Shell (xem thêm mobile/README.md)
├── deploy/                      # Script triển khai Ubuntu, cấu hình MySQL & backup Google Drive
├── docs/                        # Tài liệu thiết kế và đặc tả kỹ thuật chi tiết
├── docker-compose.yml           # Compose chuẩn cho Dev, VPS (API+DB / Fullstack) & Cloud
└── env.*.example                # Các file biến môi trường mẫu (dev, vps, render)
```

---

## 5. Cài Đặt, Chạy Local & Docker

### Cách 1: Chạy trực tiếp trên máy (Local Development)

1. **Tạo file môi trường** từ mẫu có sẵn:
   ```bash
   cp env.dev.example env.dev
   ```
   *(Mặc định dev sử dụng SQLite nếu chưa bật `DB_DRIVER=mysql`; tài khoản admin seed mặc định khai báo qua `ADMIN_USERNAME` / `ADMIN_PASSWORD` trong `env.dev`.)*

2. **Khởi động Backend API** (Go 1.26+):
   ```bash
   cd backend
   go run ./cmd/api
   ```
   Server mặc định lắng nghe tại `http://localhost:8080` (API tại `/api/v1` và Stream Proxy tại `/stream/`).
   Nếu cần tách riêng Stream Proxy sang tiến trình/cổng khác:
   ```bash
   go run ./cmd/stream
   ```

3. **Khởi động Frontend** (Node.js):
   ```bash
   cd frontend
   npm install
   npm run dev:vite
   ```
   Truy cập ứng dụng tại `http://localhost:5173`.

### Cách 2: Chạy bằng Docker Compose

Dự án dùng một file [docker-compose.yml](./docker-compose.yml) duy nhất cho các môi trường thông qua cờ `--env-file`:

- **Local Development**:
  ```bash
  docker compose --env-file env.dev up -d
  ```
- **VPS (Backend API + MySQL)**:
  ```bash
  docker compose --env-file env.vps up -d
  ```
- **Fullstack trên VPS (Frontend Nginx + Backend API + MySQL)**:
  ```bash
  docker compose --env-file env.vps --profile fullstack up -d
  ```

---

## 6. Kiểm Thử

- **Backend (Go)**:
  ```bash
  cd backend
  go test ./...
  ```
- **Frontend (TypeScript, Vitest & Build)**:
  ```bash
  cd frontend
  npx tsc --noEmit
  npm test
  npm run build:vite
  ```

---

<p align="center">
  <em>WaveLink — Tối ưu cho trải nghiệm nghe truyện dài tập mượt mà trên mọi thiết bị.</em>
</p>
