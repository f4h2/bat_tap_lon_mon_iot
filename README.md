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
| Backend | **Chỉ cần Docker Desktop** (backend build & chạy trong Docker — không cần cài JDK/Maven) |
| ESP32 thật | Arduino IDE + ESP32 core + thư viện: DHT, TinyGPSPlus, ArduinoJson |
| Giả lập ESP32 (không cần mạch) | Git Bash + `openssl` + `python3` + `curl` |

---

## Phần 1 — Backend + Database (chạy đầu tiên, bắt buộc)

Trung tâm của cả Giai đoạn 1 (admin sinh code) và Giai đoạn 3 (nhận telemetry).

```bash
cd BE

# Build + chạy backend + PostgreSQL trong Docker (lần đầu hơi lâu vì build Maven)
docker compose up -d --build

# pgAdmin (tuỳ chọn):
docker compose --profile tools up -d
```

Kiểm tra:

- **Admin Dashboard (giao diện chính):** http://localhost:8080/ — đăng nhập **`admin` / `admin123`** (HTTP Basic)
- Swagger UI (thử API trực tiếp): http://localhost:8080/swagger-ui.html
- pgAdmin: http://localhost:5050 — `admin@coldchain.com` / `admin123`

Data seed sẵn để demo: `shipment_code = SHIP-123`; `verify_code = SHIP-123-8K2P` và `SHIP-123-DEMO2` (mỗi mã dùng **một lần**).

Xem log / dừng backend:

```bash
docker compose logs -f backend    # theo dõi log
docker compose down               # dừng (giữ dữ liệu)
docker compose down -v            # dừng + xoá sạch DB (reset demo)
```

> Muốn chạy backend ngoài Docker (dev nhanh): mở `BE` bằng IntelliJ IDEA và Run `ColdChainApplication` (cần JDK 21). Khi đó chỉ bật DB: `docker compose up -d postgres`.

---

## Admin Dashboard (giao diện web)

Mở `http://localhost:8080/` sau khi backend chạy. Các màn hình bám theo nghiệp vụ:

| Tab | Nghiệp vụ | API dùng |
|---|---|---|
| **Tổng quan** | KPI: số chuyến hàng, thiết bị active, mã chưa dùng, cảnh báo | `GET /api/admin/dashboard/stats` |
| **Chuyến hàng** | Xem & tạo lô hàng kèm ngưỡng nhiệt độ/độ ẩm (Giai đoạn 1) | `GET/POST /api/admin/shipments` |
| **Mã kích hoạt** | Sinh **mã kích hoạt thiết bị** (Pha 1, không thuộc đơn ship) + QR để ESP32 quét + danh sách/lọc | `POST /api/admin/devices/generate-code`, `GET /api/admin/verify-codes` |
| **Chuyến hàng** | Mỗi đơn có nút **QR gắn đơn** để ESP32 quét (Pha 2) | `GET/POST /api/admin/shipments` |
| **Thiết bị** | ESP32 đã kích hoạt + **đơn ship đang gắn**; admin **gắn/bỏ gắn** đơn ship (ô tìm kiếm) | `GET /api/admin/devices`, `PUT /api/admin/devices/{id}/shipment` |
| **Giám sát** | Telemetry realtime: biểu đồ nhiệt độ/độ ẩm, **lộ trình GPS (2 tab: Sơ đồ offline + Bản đồ)**, pin, RSSI, hash chain, **phát hiện sửa đổi dữ liệu (tamper)** & cảnh báo (Giai đoạn 3) | `GET /api/shipments/{code}/telemetry`, `/alerts` |

**Phát hiện sửa đổi dữ liệu (tamper detection):** mỗi lần gọi `/telemetry`, backend tính lại và đối chiếu: `payload_hash = SHA256(raw_payload)`, các cột hiển thị có khớp `raw_payload` không, `record_hash`, liên kết hash chain, canonical request, và verify lại **chữ ký ECDSA** bằng public key thiết bị. Bản ghi không khớp được đánh dấu `tampered` kèm `integrity_issues`; dashboard tô đỏ dòng đó trong bảng và khoanh đỏ điểm tương ứng trên biểu đồ. Thử nghiệm: sửa thẳng một giá trị trong bảng `telemetry_records` qua pgAdmin/psql → reload tab Giám sát sẽ thấy dòng đó bị gắn cờ.

**Chống insider sửa đổi (tab Toàn vẹn):** hai lớp bổ sung chống người có quyền ghi DB:
- **HMAC record_hash bằng khóa server ngoài DB** — `record_hash = HMAC-SHA256(INTEGRITY_SECRET, …)`. Khóa đặt qua env `INTEGRITY_SECRET` (không lưu trong DB), nên người chỉ có quyền DB mà không có secret **không tính lại được** hash hợp lệ.
- **Điểm đối soát ngoài DB (external anchor / notary, append-only)** — `POST /api/admin/integrity/anchor` "công bố" head của hash chain ra bảng append-only + file `data/integrity-anchors.log`. `GET /api/admin/integrity/status` tính lại toàn chuỗi và đối chiếu các điểm đối soát đã công bố; mọi sửa/xoá lịch sử đều làm lệch điểm đối soát. Xem & thao tác ở tab **Toàn vẹn** trên dashboard.
  - *Ý nghĩa:* HMAC bảo vệ từng bản ghi ngay khi ghi (kể cả chưa có điểm đối soát). Điểm đối soát bảo vệ **toàn bộ lịch sử tính đến lúc công bố** trước kịch bản insider có luôn secret viết lại quá khứ — nên cần tạo/định kỳ để thu hẹp khoảng thời gian chưa được phủ.

> ⚠️ Vì `record_hash` đổi từ SHA256 sang HMAC, **dữ liệu telemetry cũ sẽ bị coi là tampered**. Sau khi cập nhật, hãy reset DB (`docker compose down -v && docker compose up -d`), rebuild backend rồi chạy lại `./scripts/seed-demo.sh` để có baseline sạch. Đặt `INTEGRITY_SECRET` cố định (env) nếu muốn dữ liệu tồn tại qua nhiều lần chạy.

Màn Giám sát tự động làm mới mỗi 5 giây. Các bảng danh sách đều có ô tìm kiếm. Lộ trình GPS có 2 tab: **Sơ đồ** (vẽ canvas, chạy offline) và **Bản đồ** (OpenStreetMap tương tác, vẽ trực tiếp lộ trình — cần internet); kèm nút mở lộ trình trên Google Maps.

## Vòng đời thiết bị: 2 pha tách biệt

Thiết kế tách **kích hoạt thiết bị** khỏi **gắn đơn ship**, để một thiết bị dùng lâu dài cho nhiều đơn ship nối tiếp:

- **Pha 1 — Kích hoạt (một lần):** admin sinh *mã kích hoạt* (tab Mã kích hoạt) → ESP32 nhập/quét → `POST /api/devices/verify` → thiết bị ACTIVE, có `api_key`, **chưa gắn đơn ship** (`shipment_code = null`).
- **Pha 2 — Gắn đơn ship (đổi được nhiều lần):**
  - *Device-driven:* ESP32 quét **QR đơn ship** (tab Chuyến hàng) → `POST /api/devices/bind` (ký ECDSA như telemetry).
  - *Admin-driven:* tab Thiết bị → chọn đơn ship → **Gắn** / **Bỏ gắn** (`PUT /api/admin/devices/{id}/shipment`).
- **Đổi chuyến:** trên trang monitor của ESP32 (`192.168.4.1/monitor`) có nút **Gắn/Đổi đơn ship** và **Reset thiết bị**. Bind mới sẽ thay đơn ship hiện tại; thiết bị giữ nguyên danh tính + api_key.
- Telemetry chỉ được nhận khi thiết bị **đã gắn** đơn ship (chưa gắn → `DEVICE_NOT_BOUND`).

---

## Phần 2 / Giai đoạn 2 + 3 — ESP32 Provisioning & Telemetry

Chọn **một** trong hai cách.

### Cách A — Có mạch ESP32 thật

1. Sửa [IoT/main/Config.h](IoT/main/Config.h) (`SERVER_VERIFY_URL`, `SERVER_TELEMETRY_URL`): đổi `192.168.1.5` thành **IPv4 LAN của máy chạy backend** (xem bằng `ipconfig`). ESP32 và PC phải **cùng mạng WiFi**.
2. Mở Windows Firewall cho port `8080` (nếu bị chặn, ESP32 không gọi được backend).
3. Mở [IoT/main/main.ino](IoT/main/main.ino) trong Arduino IDE (hiện 3 tab: main.ino, Config.h, WebPortal.h) → chọn board ESP32 → **Upload**.
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
