# ESP32 Web Portal — Simulator (không cần phần cứng)

Mô phỏng "thiết bị ESP32 ảo" ngay trên PC: dựng lại Web Portal và gọi thật vào backend
(kích hoạt → gắn đơn ship → gửi telemetry có ký ECDSA). Dùng để chạy/demo Portal mà không
cần Arduino IDE hay mạch thật.

## Yêu cầu
- Python 3
- `openssl` trên PATH (chạy trong **Git Bash** là có sẵn)
- Backend đang chạy (mặc định `http://localhost:8080`)

## Chạy
```bash
# từ thư mục gốc repo, trong Git Bash
BASE_URL=http://localhost:8080 python IoT/simulator/portal_sim.py
```
Rồi mở **http://localhost:8090**.

## Thao tác (giống Web Portal thật)
1. Vào dashboard (admin/admin123) → tab **Mã kích hoạt** → sinh mã, copy (VD `ACT-1B68E0C7`).
2. Trên simulator: dán mã → **Kích hoạt thiết bị**.
3. Vào tab **Chuyến hàng** tạo/chọn 1 đơn **ACTIVE** → nhập mã đơn (VD `SHIP-123`) vào simulator → **Gắn / Đổi đơn ship**.
4. Simulator tự gửi telemetry mỗi 10 giây → xem ở tab **Giám sát** của dashboard.
5. **Đổi đơn**: nhập mã đơn khác rồi Gắn lại. **Reset thiết bị**: tạo device ảo mới.

## Ghi chú
- Mỗi lần reset tạo `device_id` mới (bucket rate-limit riêng: 12 req/phút/thiết bị).
- Đây là mô phỏng logic + giao thức, KHÔNG mô phỏng Wi-Fi AP. Để test AP + provisioning
  thật thì phải nạp firmware vào ESP32 bằng Arduino IDE.
