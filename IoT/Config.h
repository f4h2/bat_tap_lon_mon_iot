#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// Phần cứng cảm biến
#define DHTPIN            15
#define DHTTYPE           DHT22
#define GPS_RX_PIN        16  
#define GPS_TX_PIN        17  
#define BATTERY_ADC_PIN   34  

// Bật/tắt theo phần cứng thật hiện có.
// Bạn nói hiện chưa có GPS/BLE/Battery, để false để chạy mô phỏng an toàn.
#define USE_GPS_SENSOR      false
#define USE_BLE_SCANNER     false
#define USE_BATTERY_SENSOR  false
#define USE_DHT_SENSOR      true

// MAC beacon BLE mục tiêu để đọc RSSI.
// Để "" nếu muốn lấy RSSI mạnh nhất từ mọi beacon lân cận.
static const char* BLE_TARGET_MAC = "";

// Chu kỳ gửi telemetry
static const uint32_t TELEMETRY_INTERVAL_MS = 10000;

// API endpoint (đổi thành backend thật của bạn)
static const char* SERVER_VERIFY_URL    = "http://192.168.1.5:8000/v1/devices/verify";
static const char* SERVER_TELEMETRY_URL = "http://192.168.1.5:8000/v1/telemetry";

// Provisioning placeholder mode:
// - Khi chưa có backend verify thật: đặt false để tự cấp api_key giả lập trên thiết bị.
// - Khi backend sẵn sàng: đặt true để gọi SERVER_VERIFY_URL và dùng verify_code.
static const bool ENABLE_SERVER_VERIFY = false;

// Wi-Fi AP khi provisioning lần đầu
static const char* AP_SSID = "ESP32-IoT-Setup";
static const char* AP_PASS = "";

// Dung lượng chuỗi cố định để lưu NVS
static const size_t WIFI_SSID_MAX    = 32;
static const size_t WIFI_PASS_MAX    = 64;
static const size_t VERIFY_CODE_MAX  = 64;
static const size_t API_KEY_MAX      = 128;
static const size_t DEVICE_ID_MAX    = 32;

// Cấu trúc lưu trữ NVS (flash) cho thông tin provisioning
struct DeviceCredentials {
  uint32_t magic;
  char wifi_ssid[WIFI_SSID_MAX + 1];
  char wifi_pass[WIFI_PASS_MAX + 1];
  char verify_code[VERIFY_CODE_MAX + 1];
  char device_id[DEVICE_ID_MAX + 1];
  char api_key[API_KEY_MAX + 1];
  uint8_t private_key_raw[32];
  bool has_private_key;
  bool is_provisioned;
};

// Dat trong header de tranh loi thu tu auto-prototype cua Arduino .ino parser.
struct SensorSnapshot {
  float temperature;
  float humidity;
  int ble_rssi;
  double gps_lat;
  double gps_lng;
  bool gps_valid;
  float battery_v;
  bool sim_temp_hum;
  bool sim_ble;
  bool sim_gps;
  bool sim_battery;
};

static const uint32_t CRED_MAGIC = 0x45535032; // "ESP2"

#endif