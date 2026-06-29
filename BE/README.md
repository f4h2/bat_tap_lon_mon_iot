# IoT Cold Chain Backend - Minimal Production Style

Backend Spring Boot cho đề tài: **Hệ thống IoT giám sát chuỗi lạnh thực phẩm/vaccine có xác thực thiết bị và chống sửa đổi dữ liệu**.

Bản này cố tình giữ scope gọn: **4 API chính**, nhưng logic bên trong vẫn có xác thực thiết bị, API key hash, verify chữ ký số, timestamp/nonce chống replay, hash chain và cảnh báo.

## Stack

- Java 21
- Spring Boot 3.3.0
- PostgreSQL
- pgAdmin
- Flyway migration
- Spring Data JPA
- Bean Validation
- OpenAPI/Swagger UI

## API chính

**API cho thiết bị IoT:**
```text
POST /api/devices/verify
POST /api/telemetry
GET  /api/shipments/{shipmentCode}/telemetry
GET  /api/shipments/{shipmentCode}/alerts
```

**API cho Admin Web Dashboard:**
```text
GET  /api/admin/devices
GET  /api/admin/shipments
POST /api/admin/shipments
POST /api/admin/devices/generate-code
GET  /api/admin/dashboard/stats
```

## Chạy PostgreSQL + pgAdmin

```bash
docker compose up -d
```

pgAdmin:

```text
URL:      http://localhost:5050
Email:    admin@coldchain.com
Password: admin123
```

Thông tin kết nối PostgreSQL trong pgAdmin:

```text
Host:     postgres
Port:     5432
Database: iot_cold_chain
Username: coldchain
Password: coldchain123
```

## Chạy backend

```bash
mvn spring-boot:run
```

Swagger UI:

```text
http://localhost:8080/swagger-ui.html
```

## Data mẫu

Flyway seed sẵn:

```text
shipment_code: SHIP-123
verify_code:   SHIP-123-8K2P
verify_code:   SHIP-123-DEMO2
```

Mỗi verify code dùng được một lần. Nếu chạy demo lần hai, đổi `VERIFY_CODE=SHIP-123-DEMO2` hoặc reset volume PostgreSQL.

## Protocol bảo mật

### 1. Provision thiết bị lần đầu

ESP32 gọi:

```http
POST /api/devices/verify
Content-Type: application/json
```

Body:

```json
{
  "device_id": "ESP32-A1B2C3D4",
  "verify_code": "SHIP-123-8K2P",
  "public_key": "-----BEGIN PUBLIC KEY-----..."
}
```

Backend xử lý:

1. Kiểm tra verify code tồn tại, chưa dùng, chưa hết hạn.
2. Kiểm tra device chưa đăng ký.
3. Parse public key PEM.
4. Sinh `api_key`.
5. Lưu `HMAC-SHA256(api_key, API_KEY_PEPPER)` vào DB.
6. Không lưu API key plaintext.
7. Trả API key đúng một lần cho ESP32.

Response:

```json
{
  "device_id": "ESP32-A1B2C3D4",
  "api_key": "iot_sk_xxxxx",
  "status": "ACTIVE",
  "shipment_code": "SHIP-123"
}
```

### 2. Gửi telemetry

ESP32 phải gửi headers:

```http
X-Device-Id: ESP32-A1B2C3D4
X-Api-Key: iot_sk_xxxxx
X-Timestamp: 1716360000
X-Nonce: random-once-value
X-Signature: Base64(signature)
```

Raw body ví dụ:

```json
{"shipment_code":"SHIP-123","temperature":-18.5,"humidity":62.3,"rssi":-67,"lat":21.028511,"lng":105.804817,"battery":87}
```

ESP32 tính:

```text
payload_hash = SHA256_HEX(raw_json_body)
```

Sau đó tạo canonical request:

```text
POST
/api/telemetry
{device_id}
{timestamp_epoch_seconds}
{nonce}
{payload_hash}
```

Ví dụ:

```text
POST
/api/telemetry
ESP32-A1B2C3D4
1716360000
abc123
b8f1...payload_hash
```

ESP32 ký canonical request bằng private key:

```text
signature = Base64(Sign(private_key, canonical_request))
```

Backend verify bằng public key đã lưu lúc provision.

Mặc định nên dùng:

```text
ECDSA P-256 + SHA256withECDSA
```

Backend cũng support:

```text
RSA + SHA256withRSA
```

## Hash chain

Mỗi bản ghi telemetry lưu:

```text
payload_hash  = SHA256(raw_payload)
record_hash   = SHA256(device_id + timestamp + payload_hash + signature + previous_hash)
previous_hash = record_hash của bản ghi trước đó theo device_id
```

Nhờ vậy:

- Sửa payload thì signature fail.
- Gửi lại request cũ thì nonce bị trùng.
- Sửa dữ liệu trong DB thì chuỗi hash bị lệch khi đối chiếu logic.
- Thiết bị giả không có private key nên không ký hợp lệ được.

## Demo flow thật bằng script

Script này không gọi API demo nào. Nó chỉ giả lập ESP32 ở phía client: sinh key, provision, ký request rồi gửi telemetry thật.

```bash
./scripts/demo-flow.sh
```

Nếu verify code đầu đã dùng:

```bash
VERIFY_CODE=SHIP-123-DEMO2 ./scripts/demo-flow.sh
```

## Reset DB demo

```bash
docker compose down -v
docker compose up -d
```

Sau đó chạy lại backend để Flyway seed data.

## Cấu trúc code

```text
controller
  DeviceController.java
  TelemetryController.java
  ShipmentQueryController.java

service
  DeviceProvisioningService.java
  TelemetryIngestionService.java
  SignatureService.java
  AlertService.java
  AuditService.java
  ShipmentQueryService.java

entity
  Device.java
  VerifyCode.java
  Shipment.java
  TelemetryRecord.java
  DeviceNonce.java
  Alert.java
  AuditLog.java

repository
  DeviceRepository.java
  VerifyCodeRepository.java
  ShipmentRepository.java
  TelemetryRecordRepository.java
  DeviceNonceRepository.java
  AlertRepository.java
  AuditLogRepository.java
```

## Việc cần thống nhất với bên ESP32

Backend đã chốt format ký như trên. Bên ESP32 phải làm đúng 5 điểm này:

1. Timestamp dùng epoch seconds, không dùng milliseconds.
2. Nonce là chuỗi ngẫu nhiên, mỗi request một nonce mới.
3. Payload hash tính trên raw JSON body y hệt body gửi đi.
4. Canonical request đúng thứ tự dòng.
5. Signature gửi lên là Base64.
