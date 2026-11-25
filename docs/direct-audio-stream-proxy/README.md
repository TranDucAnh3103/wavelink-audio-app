# Mindset mới: Direct Audio Stream Proxy cho WaveLink

> Thư mục này chứa phương án chuyển WaveLink từ **YouTube IFrame** sang **HTML5 `<audio>` + Stream Proxy (Go) + Media Session**.
> Nguồn ý tưởng: [00_MINDSET_GOC.md](./00_MINDSET_GOC.md). Các tài liệu còn lại đã **điều chỉnh theo kiến trúc thật của dự án**.

## Mục lục
| File | Nội dung |
|---|---|
| [00_MINDSET_GOC.md](./00_MINDSET_GOC.md) | Bản mindset gốc (viết cho laptop Acer 2GB, Node.js) |
| [01_PHAN_TICH_HIEN_TRANG.md](./01_PHAN_TICH_HIEN_TRANG.md) | Dự án hiện có gì, vướng ở đâu, so với mindset |
| [02_KIEN_TRUC_DE_XUAT.md](./02_KIEN_TRUC_DE_XUAT.md) | Kiến trúc chốt: BE Go, frontend adapter, bảo mật, mạng |
| [03_KE_HOACH_TRIEN_KHAI.md](./03_KE_HOACH_TRIEN_KHAI.md) | Lộ trình theo giai đoạn, có cổng go/no-go, rủi ro |
| [04_RA_SOAT_CHI_TIET_THEO_FILE.md](./04_RA_SOAT_CHI_TIET_THEO_FILE.md) | **Rà soát từng file, từng dòng**: lỗi chặn, chỗ cần sửa, ý tưởng bổ sung, đính chính tài liệu trước |

## Kết luận ngắn
1. **Hướng đi đúng.** Lý do iframe, PiP và WebView RN không ăn thua là player vẫn là YouTube iframe nên OS ngắt khi khoá màn hình. Đã có bằng chứng trong `docs/BACKGROUND_AUDIO_V3_DIAGNOSIS.md`. `<audio>` thật là cách gỡ tận gốc.
2. **Dự án đã có sẵn ~60% nền móng.**
   - Bảng `episodes` đã có `start_seconds`/`end_seconds`, tức là tập ảo đã tồn tại.
   - `SessionMiddleware` đã nhận `?token=`.
   - Kế hoạch Cloudflare Tunnel đã có trong `docs/06_...`.
3. **Điểm quyết định thành bại: YouTube có cho IP VPS của bạn lấy luồng audio không.** Phải kiểm chứng ở Giai đoạn 0 trước khi viết dòng code nào ở frontend.
4. **Giữ iframe làm fallback** sau một cờ cấu hình, không xoá ngay. Đây là lưới an toàn vì cách lấy link YouTube có thể hỏng bất cứ lúc nào.
5. **Phải sửa trước:** `WriteTimeout 20s`, `ETag`, rate limit, nếu không stream sẽ hỏng ngay.
6. **Rủi ro pháp lý (ToS YouTube)** là có thật, nhất là khi có VIP và PayOS. Xem mục Rủi ro trong file 03.
