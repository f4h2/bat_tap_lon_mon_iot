# Hệ thống IoT giám sát chuỗi lạnh (Cold Chain Monitoring)

Hệ thống IoT giám sát chuỗi lạnh thực phẩm/vaccine, có **xác thực thiết bị** và **chống sửa đổi dữ liệu** (ký số ECDSA + hash chain + chống replay).

Toàn bộ luồng dữ liệu được mô tả trong [docs/sequence_diagram.md](docs/sequence_diagram.md), chia làm 3 giai đoạn: chuẩn bị mã kích hoạt → provisioning thiết bị → gửi telemetry định kỳ.

## Các thành phần

| Thư mục | Vai trò | Tài liệu chi tiết |
|---|---|---|
| [`BE/`](BE/) | Backend Spring Boot + PostgreSQL. Nhận provision, ingest telemetry, hash chain, cảnh báo, API cho Admin Dashboard. | [BE/README.md](BE/README.md) |
| [`IoT/`](IoT/) | Firmware ESP32 (Arduino). Provisioning qua Web Portal, sinh khóa ECC, ký và gửi telemetry. | [IoT/README.md](IoT/README.md) |
| **Admin Dashboard** | Giao diện web (SPA tĩnh) phục vụ ngay trong backend tại `BE/src/main/resources/static/`. Mở tại `http://localhost:8080/`. | mục bên dưới |

> Lưu ý: Admin Dashboard không cần Node/build — Spring Boot phục vụ trực tiếp file tĩnh, **cùng origin** với API nên không vướng CORS. Chỉ cần chạy backend là có giao diện.

## Yêu cầu cài đặt (1 lần)

| Cho phần | Cần cài |
|---|---|
| Backend | Docker Desktop, **JDK 21**, **Maven** (repo không kèm `mvnw` wrapper) |
| ESP32 thật | Arduino IDE + ESP32 core + thư viện: DHT, TinyGPSPlus, ArduinoJson |
| Giả lập ESP32 (không cần mạch) | Git Bash + `openssl` + `python3` + `curl` |

---

## Phần 1 — Backend + Database (chạy đầu tiên, bắt buộc)

Trung tâm của cả Giai đoạn 1 (admin sinh code) và Giai đoạn 3 (nhận telemetry).

```bash
cd BE

# 1. Bật PostgreSQL + pgAdmin
docker compose up -d

# 2. Chạy backend (Flyway tự tạo bảng + seed data mẫu)
mvn spring-boot:run
```

Kiểm tra:

- **Admin Dashboard (giao diện chính):** http://localhost:8080/
- Swagger UI (thử API trực tiếp): http://localhost:8080/swagger-ui.html
- pgAdmin: http://localhost:5050 — `admin@coldchain.com` / `admin123`

Data seed sẵn để demo: `shipment_code = SHIP-123`; `verify_code = SHIP-123-8K2P` và `SHIP-123-DEMO2` (mỗi mã dùng **một lần**).

> Không có Maven? Mở thư mục `BE` bằng IntelliJ IDEA rồi Run trực tiếp `ColdChainApplication`.

---

## Admin Dashboard (giao diện web)

Mở `http://localhost:8080/` sau khi backend chạy. Các màn hình bám theo nghiệp vụ:

| Tab | Nghiệp vụ | API dùng |
|---|---|---|
| **Tổng quan** | KPI: số chuyến hàng, thiết bị active, mã chưa dùng, cảnh báo | `GET /api/admin/dashboard/stats` |
| **Chuyến hàng** | Xem & tạo lô hàng kèm ngưỡng nhiệt độ/độ ẩm (Giai đoạn 1) | `GET/POST /api/admin/shipments` |
| **Mã kích hoạt** | Sinh verify code + **danh sách mã** (tìm kiếm, lọc theo trạng thái) — Giai đoạn 1 | `POST /api/admin/devices/generate-code`, `GET /api/admin/verify-codes` |
| **Thiết bị** | Danh sách ESP32 đã provisioning (có **ô tìm kiếm**), trạng thái, lần cuối online (Giai đoạn 2) | `GET /api/admin/devices` |
| **Giám sát** | Telemetry realtime: biểu đồ nhiệt độ/độ ẩm, **lộ trình GPS (2 tab: Sơ đồ offline + Bản đồ)**, pin, RSSI, hash chain, **phát hiện sửa đổi dữ liệu (tamper)** & cảnh báo (Giai đoạn 3) | `GET /api/shipments/{code}/telemetry`, `/alerts` |

**Phát hiện sửa đổi dữ liệu (tamper detection):** mỗi lần gọi `/telemetry`, backend tính lại và đối chiếu: `payload_hash = SHA256(raw_payload)`, các cột hiển thị có khớp `raw_payload` không, `record_hash`, liên kết hash chain, canonical request, và verify lại **chữ ký ECDSA** bằng public key thiết bị. Bản ghi không khớp được đánh dấu `tampered` kèm `integrity_issues`; dashboard tô đỏ dòng đó trong bảng và khoanh đỏ điểm tương ứng trên biểu đồ. Thử nghiệm: sửa thẳng một giá trị trong bảng `telemetry_records` qua pgAdmin/psql → reload tab Giám sát sẽ thấy dòng đó bị gắn cờ.

Màn Giám sát tự động làm mới mỗi 5 giây. Các bảng danh sách đều có ô tìm kiếm. Lộ trình GPS có 2 tab: **Sơ đồ** (vẽ canvas, chạy offline) và **Bản đồ** (OpenStreetMap tương tác, vẽ trực tiếp lộ trình — cần internet); kèm nút mở lộ trình trên Google Maps.

## Giai đoạn 1 — Admin sinh Verify Code

Vào tab **Chuyến hàng** tạo lô hàng → tab **Mã kích hoạt** sinh verify code (hoặc dùng mã seed sẵn). Tương đương gọi `POST /api/admin/devices/generate-code`.

---

## Phần 2 / Giai đoạn 2 + 3 — ESP32 Provisioning & Telemetry

Chọn **một** trong hai cách.

### Cách A — Có mạch ESP32 thật

1. Sửa [IoT/main/Config.h](IoT/main/Config.h) (`SERVER_VERIFY_URL`, `SERVER_TELEMETRY_URL`): đổi `192.168.1.5` thành **IPv4 LAN của máy chạy backend** (xem bằng `ipconfig`). ESP32 và PC phải **cùng mạng WiFi**.
2. Mở Windows Firewall cho port `8080` (nếu bị chặn, ESP32 không gọi được backend).
3. Mở [IoT/ESP32_IoT_Device/ESP32_IoT_Device.ino](IoT/ESP32_IoT_Device/ESP32_IoT_Device.ino) trong Arduino IDE → chọn board ESP32 → **Upload**.
4. Trên điện thoại/laptop: kết nối WiFi `ESP32-IoT-Setup` (mật khẩu trống) → mở `http://192.168.4.1/` → nhập WiFi nhà → nhập verify code (`SHIP-123-8K2P`).
5. Theo dõi realtime tại `http://192.168.4.1/monitor`. Sau provisioning, thiết bị tự gửi telemetry mỗi 10 giây.

### Cách B — KHÔNG có phần cứng (nhanh nhất để demo)

Script [BE/scripts/demo-flow.sh](BE/scripts/demo-flow.sh) giả lập y hệt ESP32 (sinh khóa ECC, provision, ký ECDSA, gửi telemetry). Chạy bằng Git Bash:

```bash
cd BE
./scripts/demo-flow.sh
```

Nếu verify code đã dùng:

```bash
VERIFY_CODE=SHIP-123-DEMO2 ./scripts/demo-flow.sh
```

Script chạy trọn 4 bước: provision → gửi telemetry đã ký → query lịch sử → query alert.

**Bơm nhiều dữ liệu cho dashboard** (lộ trình GPS + biểu đồ + đủ loại cảnh báo):

```bash
cd BE
./scripts/seed-demo.sh          # mặc định 24 bản ghi cho SHIP-123
N=40 ./scripts/seed-demo.sh     # gửi 40 bản ghi
```

Script này tự sinh verify code, provision 1 thiết bị giả lập rồi gửi nhiều telemetry đã ký ECDSA — gồm vài điểm vượt ngưỡng để tạo cảnh báo. Sau khi chạy, mở tab **Giám sát** trên dashboard để xem.

---

## Xem kết quả (Giai đoạn 3)

Qua Swagger hoặc trình duyệt:

- `GET /api/shipments/SHIP-123/telemetry` — chuỗi bản ghi + hash chain
- `GET /api/shipments/SHIP-123/alerts` — cảnh báo nhiệt độ/độ ẩm
- `GET /api/admin/dashboard/stats` — số liệu tổng hợp

---

## Reset để demo lại từ đầu

```bash
cd BE
docker compose down -v   # xóa volume DB
docker compose up -d     # Flyway seed lại verify code
mvn spring-boot:run
```

Với ESP32 thật: Erase Flash rồi nạp lại firmware để vào lại chế độ provisioning.

---

## Lưu ý quan trọng

1. **Backend phải chạy trước** mọi thứ khác; ESP32 và script chỉ là client gọi vào nó.
2. Mỗi verify code chỉ dùng được **một lần** — demo lần hai thì đổi mã hoặc reset DB.
3. Backend và firmware đã chốt chung format ký (canonical request, epoch seconds, nonce, Base64 signature) — chi tiết ở cuối [BE/README.md](BE/README.md).
