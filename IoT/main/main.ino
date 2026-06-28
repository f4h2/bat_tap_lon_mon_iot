#include <DHT.h>
#include <TinyGPS++.h>
#include <HardwareSerial.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

#include "mbedtls/md.h"
#include "mbedtls/ecp.h"
#include "mbedtls/ecdsa.h"
#include "mbedtls/entropy.h"
#include "mbedtls/ctr_drbg.h"
#include "mbedtls/pk.h"
#include "mbedtls/base64.h"

#include "Config.h"
#include "WebPortal.h"

DHT dht(DHTPIN, DHTTYPE);
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);
WebServer server(80);
Preferences preferences;

DeviceCredentials credentials;
bool web_config_done = false;
String device_id = "";

bool g_wifi_connected = false;
bool g_is_provisioned = false;
uint32_t g_telemetry_sent_ok = 0;
uint32_t g_telemetry_sent_fail = 0;
int g_last_telemetry_http = 0;
unsigned long g_last_telemetry_ms = 0;

int max_ble_rssi = -120;
bool ble_initialized = false;
unsigned long last_send_ms = 0;

// Khai bao truoc de tranh loi auto-prototype cua Arduino parser.
static SensorSnapshot readSensors();
static bool sendTelemetryPayload(const SensorSnapshot& sensor);

class BLEScanCallbacks: public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) {
    if (strlen(BLE_TARGET_MAC) > 0) {
      String addr = String(advertisedDevice.getAddress().toString().c_str());
      if (!addr.equalsIgnoreCase(String(BLE_TARGET_MAC))) {
        return;
      }
    }

    if (advertisedDevice.haveRSSI()) {
      int current_rssi = advertisedDevice.getRSSI();
      if (current_rssi > max_ble_rssi) {
        max_ble_rssi = current_rssi;
      }
    }
  }
};

static float pseudoNoise(float minV, float maxV) {
  uint32_t r = esp_random() % 10000;
  float k = (float)r / 10000.0f;
  return minV + (maxV - minV) * k;
}

static void safeCopyChars(char* dest, size_t destSize, const String& src) {
  if (destSize == 0) {
    return;
  }
  strncpy(dest, src.c_str(), destSize - 1);
  dest[destSize - 1] = '\0';
}

static String getDeviceIdFromEfuse() {
  uint64_t mac = ESP.getEfuseMac();
  char idBuf[17];
  snprintf(idBuf, sizeof(idBuf), "%04X%08X", (uint16_t)(mac >> 32), (uint32_t)mac);
  return String(idBuf);
}

static void resetCredentials() {
  memset(&credentials, 0, sizeof(credentials));
  credentials.magic = CRED_MAGIC;
}

static void loadCredentials() {
  resetCredentials();
  preferences.begin("iot-secure", false);

  size_t len = preferences.getBytesLength("cred");
  if (len == sizeof(DeviceCredentials)) {
    preferences.getBytes("cred", &credentials, sizeof(DeviceCredentials));
  }
  if (credentials.magic != CRED_MAGIC) {
    resetCredentials();
  }
}

static void saveCredentials() {
  credentials.magic = CRED_MAGIC;
  preferences.putBytes("cred", &credentials, sizeof(DeviceCredentials));
}

static bool connectToWiFi(const char* ssid, const char* pass) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);

  Serial.print("[Wi-Fi] Dang ket noi");
  int timeout = 0;
  while (WiFi.status() != WL_CONNECTED && timeout < 30) {
    delay(500);
    Serial.print(".");
    timeout++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    g_wifi_connected = true;
    Serial.print("\n[Wi-Fi] Thanh cong. IP: ");
    Serial.println(WiFi.localIP());

    configTime(UTC_OFFSET_SECONDS, DST_OFFSET_SECONDS, NTP_SERVER_1, NTP_SERVER_2);
    time_t now = time(nullptr);
    int retry = 0;
    while (now < 1700000000 && retry < 20) {
      delay(300);
      now = time(nullptr);
      retry++;
    }
    if (now >= 1700000000) {
      Serial.print("[NTP] Epoch synced: ");
      Serial.println((uint32_t)now);
    } else {
      Serial.println("[NTP] Chua dong bo duoc thoi gian.");
    }
    return true;
  }

  g_wifi_connected = false;
  Serial.println("\n[Wi-Fi] That bai. Vui long kiem tra thong tin mang.");
  return false;
}

static bool generateECCKeyPair(uint8_t* out_priv, String& out_pub_pem) {
  mbedtls_ecp_keypair ec;
  mbedtls_pk_context pk;
  mbedtls_entropy_context entropy;
  mbedtls_ctr_drbg_context ctr_drbg;

  mbedtls_ecp_keypair_init(&ec);
  mbedtls_pk_init(&pk);
  mbedtls_entropy_init(&entropy);
  mbedtls_ctr_drbg_init(&ctr_drbg);

  const char* pers = "esp32-keygen";
  int rc = mbedtls_ctr_drbg_seed(&ctr_drbg, mbedtls_entropy_func, &entropy,
                                 (const unsigned char*)pers, strlen(pers));
  if (rc != 0) {
    mbedtls_ecp_keypair_free(&ec);
    mbedtls_pk_free(&pk);
    mbedtls_entropy_free(&entropy);
    mbedtls_ctr_drbg_free(&ctr_drbg);
    return false;
  }

  rc = mbedtls_ecp_gen_key(MBEDTLS_ECP_DP_SECP256R1, &ec, mbedtls_ctr_drbg_random, &ctr_drbg);
  if (rc != 0) {
    mbedtls_ecp_keypair_free(&ec);
    mbedtls_pk_free(&pk);
    mbedtls_entropy_free(&entropy);
    mbedtls_ctr_drbg_free(&ctr_drbg);
    return false;
  }

  mbedtls_mpi_write_binary(&ec.d, out_priv, 32);

  rc = mbedtls_pk_setup(&pk, mbedtls_pk_info_from_type(MBEDTLS_PK_ECKEY));
  if (rc != 0) {
    mbedtls_ecp_keypair_free(&ec);
    mbedtls_pk_free(&pk);
    mbedtls_entropy_free(&entropy);
    mbedtls_ctr_drbg_free(&ctr_drbg);
    return false;
  }

  mbedtls_ecp_keypair* pk_ec = mbedtls_pk_ec(pk);
  rc = mbedtls_ecp_group_copy(&pk_ec->grp, &ec.grp);
  rc |= mbedtls_mpi_copy(&pk_ec->d, &ec.d);
  rc |= mbedtls_ecp_copy(&pk_ec->Q, &ec.Q);
  if (rc != 0) {
    mbedtls_ecp_keypair_free(&ec);
    mbedtls_pk_free(&pk);
    mbedtls_entropy_free(&entropy);
    mbedtls_ctr_drbg_free(&ctr_drbg);
    return false;
  }

  unsigned char pem_buf[512];
  memset(pem_buf, 0, sizeof(pem_buf));
  rc = mbedtls_pk_write_pubkey_pem(&pk, pem_buf, sizeof(pem_buf));
  if (rc != 0) {
    mbedtls_ecp_keypair_free(&ec);
    mbedtls_pk_free(&pk);
    mbedtls_entropy_free(&entropy);
    mbedtls_ctr_drbg_free(&ctr_drbg);
    return false;
  }

  out_pub_pem = String((const char*)pem_buf);

  mbedtls_ecp_keypair_free(&ec);
  mbedtls_pk_free(&pk);
  mbedtls_entropy_free(&entropy);
  mbedtls_ctr_drbg_free(&ctr_drbg);
  return true;
}

static String sha256Hex(const String& input) {
  uint8_t hash[32];
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 0);
  mbedtls_md_starts(&ctx);
  mbedtls_md_update(&ctx, (const unsigned char*)input.c_str(), input.length());
  mbedtls_md_finish(&ctx, hash);
  mbedtls_md_free(&ctx);

  String out;
  out.reserve(64);
  for (int i = 0; i < 32; i++) {
    if (hash[i] < 0x10) {
      out += "0";
    }
    out += String(hash[i], HEX);
  }
  return out;
}

static bool signWithPrivateKeyBase64(const String& data, const uint8_t* priv_key, String& out_sig_b64) {
  uint8_t hash[32];
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 0);
  mbedtls_md_starts(&ctx);
  mbedtls_md_update(&ctx, (const unsigned char*)data.c_str(), data.length());
  mbedtls_md_finish(&ctx, hash);
  mbedtls_md_free(&ctx);

  mbedtls_ecdsa_context ecdsa;
  mbedtls_entropy_context entropy;
  mbedtls_ctr_drbg_context ctr_drbg;
  mbedtls_mpi r, s;

  mbedtls_ecdsa_init(&ecdsa);
  mbedtls_entropy_init(&entropy);
  mbedtls_ctr_drbg_init(&ctr_drbg);
  mbedtls_mpi_init(&r);
  mbedtls_mpi_init(&s);

  const char* pers = "esp32-sign";
  int rc = mbedtls_ctr_drbg_seed(&ctr_drbg, mbedtls_entropy_func, &entropy,
                                 (const unsigned char*)pers, strlen(pers));
  rc |= mbedtls_ecp_group_load(&ecdsa.grp, MBEDTLS_ECP_DP_SECP256R1);
  rc |= mbedtls_mpi_read_binary(&ecdsa.d, priv_key, 32);

  unsigned char der_sig[128];
  size_t der_len = 0;
  if (rc == 0) {
    rc = mbedtls_ecdsa_write_signature(&ecdsa, MBEDTLS_MD_SHA256, hash, sizeof(hash),
                                       der_sig, &der_len, mbedtls_ctr_drbg_random, &ctr_drbg);
  }

  unsigned char b64_sig[192];
  size_t b64_len = 0;
  if (rc == 0) {
    rc = mbedtls_base64_encode(b64_sig, sizeof(b64_sig), &b64_len, der_sig, der_len);
  }

  mbedtls_ecdsa_free(&ecdsa);
  mbedtls_entropy_free(&entropy);
  mbedtls_ctr_drbg_free(&ctr_drbg);
  mbedtls_mpi_free(&r);
  mbedtls_mpi_free(&s);

  if (rc != 0) {
    return false;
  }

  b64_sig[b64_len] = '\0';
  out_sig_b64 = String((const char*)b64_sig);
  return true;
}

static String randomNonceHex() {
  uint32_t a = esp_random();
  uint32_t b = esp_random();
  char buf[17];
  snprintf(buf, sizeof(buf), "%08X%08X", a, b);
  return String(buf);
}

static void assignPlaceholderApiKey(const String& publicKeyPem) {
  // Placeholder api_key dùng khi chưa có backend verify.
  String seed = device_id + "." + publicKeyPem + "." + randomNonceHex();
  String h = sha256Hex(seed);
  String apiKey = "demo_" + h.substring(0, 48);
  safeCopyChars(credentials.api_key, sizeof(credentials.api_key), apiKey);
  safeCopyChars(credentials.shipment_code, sizeof(credentials.shipment_code), DEFAULT_SHIPMENT_CODE);
}

static bool callAPIVerify(const String& publicKeyPem) {
  if (!ENABLE_SERVER_VERIFY) {
    assignPlaceholderApiKey(publicKeyPem);
    Serial.println("[VERIFY] ENABLE_SERVER_VERIFY=false, su dung api_key gia lap.");
    return true;
  }

  if (strlen(SERVER_VERIFY_URL) == 0) {
    assignPlaceholderApiKey(publicKeyPem);
    Serial.println("[VERIFY] SERVER_VERIFY_URL rong, su dung api_key gia lap.");
    return true;
  }

  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  HTTPClient http;
  http.begin(SERVER_VERIFY_URL);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<512> doc;
  doc["device_id"] = device_id;
  doc["verify_code"] = credentials.verify_code;
  doc["public_key"] = publicKeyPem;

  String body;
  serializeJson(doc, body);

  Serial.println("[VERIFY] Dang gui verify_code + public_key...");
  int code = http.POST(body);

  bool ok = false;
  if (code == 200 || code == 201) {
    String resp = http.getString();
    StaticJsonDocument<384> respDoc;
    if (deserializeJson(respDoc, resp) == DeserializationError::Ok && respDoc["api_key"]) {
      safeCopyChars(credentials.api_key, sizeof(credentials.api_key), (const char*)respDoc["api_key"]);
      if (respDoc["shipment_code"]) {
        safeCopyChars(credentials.shipment_code, sizeof(credentials.shipment_code), (const char*)respDoc["shipment_code"]);
      } else {
        safeCopyChars(credentials.shipment_code, sizeof(credentials.shipment_code), DEFAULT_SHIPMENT_CODE);
      }
      ok = true;
    }
  } else {
    Serial.print("[VERIFY] Loi HTTP: ");
    Serial.println(code);
  }

  http.end();
  return ok;
}

static void initGpsIfEnabled() {
  if (USE_GPS_SENSOR) {
    gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
    Serial.println("[GPS] Bat GPS UART.");
  } else {
    Serial.println("[GPS] Dang dung che do mo phong.");
  }
}

static void initBleIfEnabled() {
  if (USE_BLE_SCANNER) {
    BLEDevice::init("");
    ble_initialized = true;
    Serial.println("[BLE] Bat BLE scanner.");
  } else {
    Serial.println("[BLE] Dang dung che do mo phong.");
  }
}

static int scanBLE(float durationSec) {
  if (!USE_BLE_SCANNER || !ble_initialized) {
    return (int)pseudoNoise(-90.0f, -55.0f);
  }

  max_ble_rssi = -120;
  BLEScan* scanner = BLEDevice::getScan();
  scanner->setAdvertisedDeviceCallbacks(new BLEScanCallbacks(), false);
  scanner->setActiveScan(true);
  scanner->start(durationSec, false);
  scanner->clearResults();
  return max_ble_rssi;
}

static float readBatteryVoltage() {
  if (!USE_BATTERY_SENSOR) {
    return pseudoNoise(3.72f, 4.05f);
  }
  int raw = analogRead(BATTERY_ADC_PIN);
  return (raw / 4095.0f) * 3.3f * 2.0f;
}

static SensorSnapshot readSensors() {
  SensorSnapshot s;
  memset(&s, 0, sizeof(s));

  s.sim_temp_hum = false;
  s.sim_ble = !USE_BLE_SCANNER;
  s.sim_gps = !USE_GPS_SENSOR;
  s.sim_battery = !USE_BATTERY_SENSOR;

  if (USE_DHT_SENSOR) {
    s.temperature = dht.readTemperature();
    s.humidity = dht.readHumidity();
    if (isnan(s.temperature) || isnan(s.humidity)) {
      s.temperature = pseudoNoise(24.5f, 30.5f);
      s.humidity = pseudoNoise(45.0f, 75.0f);
      s.sim_temp_hum = true;
    }
  } else {
    s.temperature = pseudoNoise(24.5f, 30.5f);
    s.humidity = pseudoNoise(45.0f, 75.0f);
    s.sim_temp_hum = true;
  }

  if (USE_GPS_SENSOR) {
    while (gpsSerial.available() > 0) {
      gps.encode(gpsSerial.read());
    }
    s.gps_valid = gps.location.isValid();
    s.gps_lat = s.gps_valid ? gps.location.lat() : 10.7769;
    s.gps_lng = s.gps_valid ? gps.location.lng() : 106.7009;
    s.sim_gps = !s.gps_valid;
  } else {
    s.gps_valid = false;
    s.gps_lat = 10.7769 + pseudoNoise(-0.005f, 0.005f);
    s.gps_lng = 106.7009 + pseudoNoise(-0.005f, 0.005f);
  }

  s.ble_rssi = scanBLE(1.5f);
  s.battery_v = readBatteryVoltage();

  return s;
}

static bool sendTelemetryPayload(const SensorSnapshot& sensor) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[TELEMETRY] Bo qua vi mat ket noi Wi-Fi.");
    return false;
  }

  time_t now = time(nullptr);
  if (now < 1700000000) {
    Serial.println("[TELEMETRY] Epoch chua hop le. Bo qua lan gui nay.");
    return false;
  }
  uint32_t ts = (uint32_t)now;
  String nonce = randomNonceHex();

  StaticJsonDocument<384> telemetry;
  telemetry["shipment_code"] = strlen(credentials.shipment_code) > 0 ? credentials.shipment_code : DEFAULT_SHIPMENT_CODE;
  telemetry["temperature"] = sensor.temperature;
  telemetry["humidity"] = sensor.humidity;
  telemetry["rssi"] = sensor.ble_rssi;
  telemetry["lat"] = sensor.gps_lat;
  telemetry["lng"] = sensor.gps_lng;
  int batteryPct = (int)constrain(((sensor.battery_v - 3.3f) / (4.2f - 3.3f)) * 100.0f, 0.0f, 100.0f);
  telemetry["battery"] = batteryPct;

  String telemetryPayload;
  serializeJson(telemetry, telemetryPayload);

  String payloadHash = sha256Hex(telemetryPayload);
  String canonicalRequest = "POST\n/api/telemetry\n" + device_id + "\n" + String(ts) + "\n" + nonce + "\n" + payloadHash;
  String signatureB64;
  if (!signWithPrivateKeyBase64(canonicalRequest, credentials.private_key_raw, signatureB64)) {
    Serial.println("[TELEMETRY] Khong tao duoc signature Base64.");
    g_telemetry_sent_fail++;
    return false;
  }

  HTTPClient http;
  http.begin(SERVER_TELEMETRY_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", credentials.api_key);
  http.addHeader("x-device-id", device_id);
  http.addHeader("x-timestamp", String(ts));
  http.addHeader("x-nonce", nonce);
  http.addHeader("x-signature", signatureB64);

  int code = http.POST(telemetryPayload);
  g_last_telemetry_http = code;
  if (code > 0 && code < 300) {
    g_telemetry_sent_ok++;
    g_last_telemetry_ms = millis();
  } else {
    g_telemetry_sent_fail++;
  }

  if (code > 0) {
    Serial.printf("[TELEMETRY] Gui thanh cong, HTTP %d\n", code);
  } else {
    Serial.printf("[TELEMETRY] Loi gui: %s\n", http.errorToString(code).c_str());
  }
  http.end();
  return code > 0 && code < 300;
}

static bool runProvisioningFlow() {
  Serial.println("[PROVISION] Bat dau portal setup Wi-Fi + verify code (tuy chon).");
  startWebPortal();

  while (!web_config_done) {
    server.handleClient();
    delay(2);
  }
  web_config_done = false;

  if (!connectToWiFi(credentials.wifi_ssid, credentials.wifi_pass)) {
    Serial.println("[PROVISION] Khong ket noi duoc Wi-Fi sau khi nhap portal.");
    return false;
  }

  String pubKeyPem;
  if (!generateECCKeyPair(credentials.private_key_raw, pubKeyPem)) {
    Serial.println("[PROVISION] Tao key pair that bai.");
    return false;
  }

  Serial.println("[PROVISION] Dang xu ly verify de nhan x-api-key...");
  if (!callAPIVerify(pubKeyPem)) {
    Serial.println("[PROVISION] Verify that bai. Kiem tra verify_code hoac backend.");
    return false;
  }

  safeCopyChars(credentials.device_id, sizeof(credentials.device_id), device_id);
  credentials.has_private_key = true;
  credentials.is_provisioned = true;
  g_is_provisioned = true;
  saveCredentials();

  Serial.println("[PROVISION] Thanh cong: da luu device_id, api_key, private_key vao NVS.");
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(300);

  analogReadResolution(12);

  device_id = getDeviceIdFromEfuse();
  Serial.println("\n================ ESP32 IoT Device ================");
  Serial.print("[INFO] Device ID: ");
  Serial.println(device_id);

  loadCredentials();

  bool hasProvisionedData = credentials.is_provisioned && credentials.has_private_key
    && strlen(credentials.api_key) > 0 && strlen(credentials.wifi_ssid) > 0;

  g_is_provisioned = hasProvisionedData;

  if (!hasProvisionedData) {
    if (!runProvisioningFlow()) {
      Serial.println("[FATAL] Provisioning chua hoan tat. Dang doi reboot...");
      while (1) {
        delay(1000);
      }
    }
  } else {
    Serial.println("[BOOT] Da co thong tin provision trong NVS.");
    if (!connectToWiFi(credentials.wifi_ssid, credentials.wifi_pass)) {
      Serial.println("[BOOT] Mat ket noi Wi-Fi, thiet bi se tiep tuc thu lai trong vong lap.");
    }
  }

  if (USE_DHT_SENSOR) {
    dht.begin();
  }
  initGpsIfEnabled();
  initBleIfEnabled();

  Serial.println("[BOOT] San sang gui telemetry.");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED && strlen(credentials.wifi_ssid) > 0) {
    connectToWiFi(credentials.wifi_ssid, credentials.wifi_pass);
  }

  server.handleClient();

  if (millis() - last_send_ms >= TELEMETRY_INTERVAL_MS) {
    last_send_ms = millis();
    SensorSnapshot snap = readSensors();
    sendTelemetryPayload(snap);
  }

  delay(20);
}



