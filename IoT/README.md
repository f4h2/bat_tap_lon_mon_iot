# ESP32 IoT Firmware

Tai lieu nay dung cho phan firmware ESP32 trong thu muc `IoT`.

## File code chinh

Sketch nam gon trong 1 thu muc `IoT/main/`. Mo trong Arduino IDE bang cach mo
**`IoT/main/main.ino`** -> se hien 3 tab: `main.ino`, `Config.h`, `WebPortal.h`.

- Firmware chinh: `IoT/main/main.ino`
- Cau hinh (sua IP server o day): `IoT/main/Config.h`
- Giao dien portal (kich hoat / gan don ship / monitor): `IoT/main/WebPortal.h`

Luu y Arduino IDE: 1 sketch = 1 thu muc, file `.ino` chinh phai trung ten thu muc,
va tat ca file `.ino`/`.h` trong cung thu muc moi duoc bien dich chung. Vi vay phai
mo `main/main.ino` (khong mo file don le o noi khac).

## Mo phong khong can phan cung

Neu chua co mach ESP32, dung simulator tren PC: xem `IoT/simulator/README.md`.

## Provisioning flow

1. Flash firmware len ESP32.
2. Neu thiet bi chua co credentials trong NVS, ESP32 mo AP provisioning:
   - SSID: `ESP32-IoT-Setup`
   - Password: de trong (AP mo)
3. Ket noi dien thoai/laptop vao AP tren.
4. Mo trinh duyet:
   - Trang nhap Wi-Fi: `http://192.168.4.1/`
   - Trang nhap verify code: `http://192.168.4.1/verify`
   - Trang monitor: `http://192.168.4.1/monitor`
5. Nhap Wi-Fi + verify code de thiet bi goi API verify.

## Neu khong thay AP provisioning

- Mo Serial Monitor 115200 va reboot board.
- Kiem tra co log dang:
  - `[AP] Da mo diem phat:`
  - `[AP] Truy cap: http://192.168.4.1`
- Neu da provision truoc do, firmware se bo qua portal.
  Cach nhanh de vao lai provisioning: Erase Flash roi flash lai.

## Cau hinh endpoint

Sua trong `IoT/main/Config.h`:

- `SERVER_VERIFY_URL`
- `SERVER_TELEMETRY_URL`
- `ENABLE_SERVER_VERIFY`

Vi du backend local:

- `http://192.168.1.5:8080/api/devices/verify`
- `http://192.168.1.5:8080/api/telemetry`

## Thu vien can co (Arduino)

- DHT sensor library
- TinyGPSPlus
- ArduinoJson
- ESP32 core (co san WiFi, WebServer, Preferences)
- mbedTLS (di kem ESP32 core)

## Luong du lieu sau khi provision

1. Doc sensor (DHT/BLE/GPS/Battery theo toggle trong `Config.h`).
2. Ky payload bang private key ECC P-256.
3. Gui telemetry dinh ky theo `TELEMETRY_INTERVAL_MS`.
