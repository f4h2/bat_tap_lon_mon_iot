# Sơ đồ luồng dữ liệu (Data Flow & Sequence Diagram)

Sơ đồ dưới đây mô tả toàn bộ vòng đời của một thiết bị IoT trong hệ thống Cold Chain. Để dễ theo dõi, sơ đồ được chia làm 3 giai đoạn riêng biệt.

## Giai đoạn 1: Chuẩn bị mã kích hoạt
Quản trị viên sinh mã Verify Code trên Web Dashboard để chuẩn bị cấp cho một thiết bị IoT mới.

```mermaid
sequenceDiagram
    autonumber
    participant Admin as Admin / Quản lý
    participant Web as Web Dashboard
    participant BE as Backend Server
    participant DB as PostgreSQL DB

    Note over Admin, DB: 1. Chuẩn bị mã kích hoạt (Verify Code)
    Admin->>Web: Tạo chuyến hàng & Sinh mã Verify Code mới
    Web->>BE: POST /api/admin/devices/generate-code
    BE->>DB: Lưu VerifyCode mới (Trạng thái UNUSED)
    BE-->>Web: Trả về VerifyCode (VD: SHIP-123-A8K9)
    Web-->>Admin: Hiển thị VerifyCode lên màn hình
```

## Giai đoạn 2: Nạp code & Cấu hình thiết bị (Provisioning)
Người dùng nạp code cho mạch ESP32. Sau đó kết nối vào mạng WiFi do ESP32 phát ra để cài đặt WiFi nhà và nhập mã Verify Code.

```mermaid
sequenceDiagram
    autonumber
    participant DB as PostgreSQL DB
    participant BE as Backend Server
    participant User as Người dùng
    participant ESP32 as Mạch ESP32

    Note over DB, ESP32: 2. Nạp code & Cấu hình thiết bị (Provisioning)
    User->>ESP32: Flash Firmware (nạp code qua cáp USB)
    ESP32->>ESP32: Khởi động, phát WiFi Access Point (AP Mode)
    User->>ESP32: Kết nối WiFi của mạch, truy cập Web Portal (192.168.4.1)
    User->>ESP32: Điền WiFi SSID/Pass nhà & mã VerifyCode
    ESP32->>ESP32: Sinh cặp khóa ECC (Private Key & Public Key)
    ESP32->>BE: POST /api/devices/verify (Kèm DeviceID, VerifyCode, Public Key)
    
    BE->>DB: Kiểm tra VerifyCode tồn tại và chưa sử dụng
    DB-->>BE: Hợp lệ (UNUSED)
    BE->>BE: Sinh ra API_KEY và mã hóa thành API_KEY_HASH
    BE->>DB: Lưu thông tin Device & Chuyển VerifyCode thành USED
    BE-->>ESP32: Trả về API_KEY (Chỉ gửi 1 lần duy nhất)
    
    ESP32->>ESP32: Lưu API_KEY, Private Key vào bộ nhớ NVS (Flash)
    ESP32-->>User: Báo cấu hình thành công trên Web Portal
    ESP32->>ESP32: Khởi động lại (Reboot) để kết nối WiFi nhà
```

## Giai đoạn 3: Hoạt động (Telemetry Loop)
Thiết bị đọc cảm biến định kỳ, mã hóa dữ liệu, ký chữ ký điện tử và gửi lên Backend. Backend xác thực và lưu vào chuỗi Hash Chain.

```mermaid
sequenceDiagram
    autonumber
    participant DB as PostgreSQL DB
    participant BE as Backend Server
    participant ESP32 as Mạch ESP32
    participant Sensor as Cảm biến

    Note over DB, Sensor: 3. Gửi dữ liệu định kỳ (Mỗi 10 giây)
    loop Telemetry Loop
        ESP32->>Sensor: Đọc thông số (Nhiệt độ, Độ ẩm, GPS, Pin, BLE RSSI)
        Sensor-->>ESP32: Trả về dữ liệu cảm biến
        ESP32->>ESP32: Đóng gói JSON Payload
        ESP32->>ESP32: Lấy Timestamp (Unix Epoch) và sinh Nonce ngẫu nhiên
        ESP32->>ESP32: Tính Payload_Hash = SHA256(JSON Payload)
        ESP32->>ESP32: Tạo Canonical Request (chuỗi chuẩn hóa)
        ESP32->>ESP32: Dùng Private Key để Ký số (ECDSA Signature)
        ESP32->>BE: POST /api/telemetry (Headers: API_Key, Timestamp, Nonce, Signature)
        
        BE->>DB: Kiểm tra DeviceID & so khớp API_KEY_HASH
        DB-->>BE: Thiết bị và API Key hợp lệ
        BE->>BE: Kiểm tra Timestamp và Nonce (Chống Replay attack)
        BE->>BE: Xác thực Chữ ký số (ECDSA Verify) bằng Public Key
        
        alt Chữ ký HỢP LỆ & Dữ liệu toàn vẹn
            BE->>DB: Lấy Previous_Hash của bản ghi cũ
            BE->>BE: Tính Record_Hash = SHA256(DeviceID + Timestamp + Payload_Hash + Signature + Previous_Hash)
            BE->>DB: Lưu bản ghi Telemetry (Hash Chain) & Lưu Alert (nếu có)
            BE-->>ESP32: Trả về 200 OK (Thành công)
        else Chữ ký SAI / Dữ liệu bị chỉnh sửa
            BE-->>ESP32: Trả về 401 Unauthorized / 403 Forbidden
        end
    end
```
