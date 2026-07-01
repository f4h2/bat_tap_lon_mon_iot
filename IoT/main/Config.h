#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// Phan cung cam bien
#define DHTPIN            15
#define DHTTYPE           DHT22
#define GPS_RX_PIN        16
#define GPS_TX_PIN        17
#define BATTERY_ADC_PIN   34

// Bat/tat theo phan cung that hien co.
#define USE_GPS_SENSOR      false
#define USE_BLE_SCANNER     false
#define USE_BATTERY_SENSOR  false
#define USE_DHT_SENSOR      true

// MAC beacon BLE muc tieu de doc RSSI.
static const char* BLE_TARGET_MAC = "";

// Chu ky gui telemetry
static const uint32_t TELEMETRY_INTERVAL_MS = 10000;

// API endpoint (doi thanh backend that cua ban)
static const char* SERVER_VERIFY_URL    = "https://iot.tranbadat.vn/api/devices/verify";   // Pha 1: kích hoạt
static const char* SERVER_BIND_URL      = "https://iot.tranbadat.vn/api/devices/bind";     // Pha 2: gắn đơn ship
static const char* SERVER_TELEMETRY_URL = "https://iot.tranbadat.vn/api/telemetry";

// Provisioning placeholder mode
static const bool ENABLE_SERVER_VERIFY = true;

// NTP de lay epoch seconds phuc vu X-Timestamp.
static const char* NTP_SERVER_1 = "pool.ntp.org";
static const char* NTP_SERVER_2 = "time.google.com";
static const long UTC_OFFSET_SECONDS = 7 * 3600;
static const int DST_OFFSET_SECONDS = 0;

// Fallback shipment khi backend verify chua tra shipment_code.
static const char* DEFAULT_SHIPMENT_CODE = "SHIP-123";

// Wi-Fi AP khi provisioning lan dau
static const char* AP_SSID = "ESP32-IoT-Setup";
static const char* AP_PASS = "";

// Dung luong chuoi co dinh de luu NVS
static const size_t WIFI_SSID_MAX    = 32;
static const size_t WIFI_PASS_MAX    = 64;
static const size_t VERIFY_CODE_MAX  = 64;
static const size_t API_KEY_MAX      = 128;
static const size_t DEVICE_ID_MAX    = 32;
static const size_t SHIPMENT_CODE_MAX = 64;

// Cau truc luu tru NVS (flash) cho thong tin provisioning
struct DeviceCredentials {
  uint32_t magic;
  char wifi_ssid[WIFI_SSID_MAX + 1];
  char wifi_pass[WIFI_PASS_MAX + 1];
  char verify_code[VERIFY_CODE_MAX + 1];
  char device_id[DEVICE_ID_MAX + 1];
  char api_key[API_KEY_MAX + 1];
  char shipment_code[SHIPMENT_CODE_MAX + 1];
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
