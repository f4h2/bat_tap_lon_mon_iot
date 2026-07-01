#ifndef WEB_PORTAL_H
#define WEB_PORTAL_H

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include "Config.h"

extern WebServer server;
extern DeviceCredentials credentials;
extern bool web_config_done;
extern String device_id;
extern bool g_wifi_connected;
extern bool g_is_provisioned;
extern uint32_t g_telemetry_sent_ok;
extern uint32_t g_telemetry_sent_fail;
extern int g_last_telemetry_http;
extern unsigned long g_last_telemetry_ms;

extern bool rebindShipment(const String& shipmentCode);
extern void factoryResetAndReboot();

static inline void safeCopy(char* dest, size_t destSize, const String& src) {
  if (destSize == 0) {
    return;
  }
  strncpy(dest, src.c_str(), destSize - 1);
  dest[destSize - 1] = '\0';
}

const char HTML_INDEX[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ESP32 Provisioning</title>
  <style>
    :root {
      --bg1: #0b172a;
      --bg2: #153a52;
      --card: #f7fbff;
      --text: #11253a;
      --accent: #e65f2b;
      --accent-dark: #c74a1a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      background: radial-gradient(circle at 15% 20%, #1d6f8d 0%, var(--bg1) 48%, #06111f 100%);
      color: var(--text);
      display: grid;
      place-items: center;
      padding: 16px;
    }
    .card {
      width: 100%;
      max-width: 460px;
      background: var(--card);
      border-radius: 16px;
      padding: 22px;
      box-shadow: 0 18px 40px rgba(2, 9, 17, 0.35);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 22px;
      color: #0f2c44;
    }
    .device {
      margin-bottom: 14px;
      font-size: 13px;
      color: #355a79;
      padding: 8px 10px;
      border-radius: 10px;
      background: #e9f4ff;
      word-break: break-all;
    }
    .group { margin-bottom: 14px; }
    label {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 700;
      color: #26435f;
    }
    input {
      width: 100%;
      padding: 11px;
      border: 1px solid #b7cce0;
      border-radius: 10px;
      font-size: 14px;
    }
    input:focus {
      outline: none;
      border-color: #2d89bd;
      box-shadow: 0 0 0 3px rgba(45, 137, 189, 0.2);
    }
    .actions {
      display: grid;
      gap: 10px;
    }
    button {
      border: 0;
      border-radius: 10px;
      padding: 12px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .primary {
      background: var(--accent);
      color: #fff;
    }
    .primary:hover { background: var(--accent-dark); }
    .secondary {
      background: #d7e8f7;
      color: #193a58;
    }
    #scanResult {
      margin-top: 8px;
      font-size: 12px;
      color: #2b587d;
      min-height: 16px;
    }
    video {
      width: 100%;
      max-height: 190px;
      border-radius: 10px;
      background: #00111f;
      display: none;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Kích hoạt thiết bị ESP32</h1>
    <div class="device">Device ID: {{DEVICE_ID}}</div>
    <div style="font-size:12px;color:#476887;margin-bottom:12px">
      Nhập Wi-Fi nhà + mã kích hoạt (lấy ở Dashboard). Mẹo: dùng "QR mở nhanh" trên Dashboard,
      quét bằng camera điện thoại (đã nối Wi-Fi ESP32) để tự điền sẵn mã. Mã đơn ship là tùy chọn.
    </div>
    <form action="/provision" method="POST">
      <div class="group">
        <label>Tên Wi-Fi (SSID)</label>
        <input type="text" name="ssid" placeholder="Nhập tên Wi-Fi nhà" required>
      </div>
      <div class="group">
        <label>Mật khẩu Wi-Fi</label>
        <input type="password" name="password" placeholder="Nhập mật khẩu Wi-Fi">
      </div>
      <div class="group">
        <label>Mã kích hoạt</label>
        <input type="text" name="vcode" value="{{VCODE}}" placeholder="VD: ACT-XXXXXXXX" required>
      </div>
      <div class="group">
        <label>Mã đơn ship (tùy chọn — có thể gắn sau)</label>
        <input type="text" name="ship" value="{{SHIP}}" placeholder="VD: SHIP-123">
      </div>
      <div class="actions">
        <button class="primary" type="submit">Kích hoạt thiết bị</button>
      </div>
    </form>
  </div>
</body>
</html>
)rawliteral";

const char HTML_MONITOR[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ESP32 Telemetry Monitor</title>
  <style>
    :root {
      --bg1: #0f172a;
      --bg2: #1d3557;
      --card: #f8fbff;
      --text: #0e2238;
      --ok: #1f9d55;
      --warn: #d97706;
      --err: #c53030;
      --accent: #1f6feb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      background: radial-gradient(circle at 20% 20%, #2b6cb0 0%, var(--bg1) 45%, #050d18 100%);
      color: var(--text);
      display: grid;
      place-items: center;
      padding: 16px;
    }
    .card {
      width: 100%;
      max-width: 580px;
      background: var(--card);
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 18px 40px rgba(2, 9, 17, 0.35);
    }
    h1 { margin: 0 0 14px; color: #123453; font-size: 24px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .item {
      background: #edf4ff;
      border-radius: 10px;
      padding: 10px;
      font-size: 13px;
    }
    .label { color: #2f5273; font-weight: 700; margin-bottom: 4px; display: block; }
    .value { font-size: 15px; color: #0f2c44; word-break: break-all; }
    .status-ok { color: var(--ok); font-weight: 700; }
    .status-warn { color: var(--warn); font-weight: 700; }
    .status-err { color: var(--err); font-weight: 700; }
    .note {
      margin-top: 12px;
      color: #446789;
      font-size: 12px;
    }
    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Trạng thái truyền dữ liệu</h1>
    <div class="grid">
      <div class="item"><span class="label">Device ID</span><div id="device" class="value">-</div></div>
      <div class="item"><span class="label">Wi-Fi</span><div id="wifi" class="value">-</div></div>
      <div class="item"><span class="label">Kích hoạt</span><div id="prov" class="value">-</div></div>
      <div class="item"><span class="label">Telemetry thành công</span><div id="ok" class="value">0</div></div>
      <div class="item"><span class="label">Telemetry lỗi</span><div id="fail" class="value">0</div></div>
      <div class="item"><span class="label">HTTP cuối</span><div id="http" class="value">-</div></div>
      <div class="item"><span class="label">Lần gửi cuối (ms)</span><div id="last" class="value">-</div></div>
      <div class="item"><span class="label">Thông báo</span><div id="msg" class="value">Đang chờ dữ liệu...</div></div>
    </div>
    <div class="note">Trang tự động cập nhật mỗi 2 giây.</div>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <form action="/rebind" method="POST" style="display:flex;gap:6px;flex:1;min-width:200px">
        <input name="ship" value="{{SHIP}}" placeholder="Mã đơn ship mới (VD SHIP-123)" required
               style="flex:1;padding:9px;border-radius:8px;border:1px solid #b7cce0">
        <button type="submit" style="padding:9px 12px;border:0;border-radius:8px;background:#1f6feb;color:#fff;font-weight:700">Gắn / Đổi đơn ship</button>
      </form>
      <form action="/reset" method="POST" onsubmit="return confirm('Reset thiết bị? Sẽ phải kích hoạt lại.')">
        <button type="submit" style="padding:9px 12px;border:0;border-radius:8px;background:#c53030;color:#fff;font-weight:700">Reset thiết bị</button>
      </form>
    </div>
  </div>

  <script>
    function setStatus(el, ok, text) {
      el.classList.remove('status-ok', 'status-warn', 'status-err');
      el.classList.add(ok === 1 ? 'status-ok' : (ok === 0 ? 'status-warn' : 'status-err'));
      el.textContent = text;
    }

    async function refreshStatus() {
      try {
        const res = await fetch('/status', { cache: 'no-store' });
        const d = await res.json();

        document.getElementById('device').textContent = d.device_id || '-';
        setStatus(document.getElementById('wifi'), d.wifi_connected ? 1 : -1, d.wifi_connected ? 'Đã kết nối' : 'Mất kết nối');
        setStatus(document.getElementById('prov'), d.provisioned ? 1 : 0, d.provisioned ? 'Đã kích hoạt' : 'Đang kích hoạt');
        document.getElementById('ok').textContent = String(d.telemetry_ok || 0);
        document.getElementById('fail').textContent = String(d.telemetry_fail || 0);
        document.getElementById('http').textContent = String(d.last_http_code || 0);
        document.getElementById('last').textContent = String(d.last_send_ms || 0);

        if ((d.telemetry_ok || 0) > 0) {
          document.getElementById('msg').textContent = 'ESP32 đang gửi telemetry bình thường.';
        } else if (!d.wifi_connected) {
          document.getElementById('msg').textContent = 'Chưa có Wi-Fi, ESP32 đang thử kết nối lại.';
        } else {
          document.getElementById('msg').textContent = 'Đã có Wi-Fi, đang chờ bản tin telemetry đầu tiên...';
        }
      } catch (e) {
        document.getElementById('msg').textContent = 'Không đọc được /status (có thể ESP32 đang reboot).';
      }
    }

    refreshStatus();
    setInterval(refreshStatus, 2000);
  </script>
</body>
</html>
)rawliteral";

void handleRoot() {
  String html = HTML_INDEX;
  html.replace("{{DEVICE_ID}}", device_id);
  // Điền sẵn mã khi mở bằng "QR mở nhanh": /?vcode=...&ship=...
  html.replace("{{VCODE}}", server.arg("vcode"));
  html.replace("{{SHIP}}", server.arg("ship"));
  server.send(200, "text/html", html);
}

void handleMonitor() {
  String html = HTML_MONITOR;
  // Điền sẵn mã đơn ship khi mở /monitor?ship=... (đổi đơn nhanh bằng QR).
  html.replace("{{SHIP}}", server.arg("ship"));
  server.send(200, "text/html", html);
}

void handleStatus() {
  StaticJsonDocument<256> doc;
  doc["device_id"] = device_id;
  doc["wifi_connected"] = g_wifi_connected;
  doc["provisioned"] = g_is_provisioned;
  doc["telemetry_ok"] = g_telemetry_sent_ok;
  doc["telemetry_fail"] = g_telemetry_sent_fail;
  doc["last_http_code"] = g_last_telemetry_http;
  doc["last_send_ms"] = g_last_telemetry_ms;

  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

// Nhận toàn bộ thông tin trong 1 form: Wi-Fi + mã kích hoạt + đơn ship (tùy chọn).
void handleProvision() {
  if (server.hasArg("ssid") && server.hasArg("vcode") && server.arg("vcode").length() > 0) {
    safeCopy(credentials.wifi_ssid, sizeof(credentials.wifi_ssid), server.arg("ssid"));
    safeCopy(credentials.wifi_pass, sizeof(credentials.wifi_pass), server.arg("password"));
    safeCopy(credentials.verify_code, sizeof(credentials.verify_code), server.arg("vcode"));
    if (server.hasArg("ship") && server.arg("ship").length() > 0)
      safeCopy(credentials.shipment_code, sizeof(credentials.shipment_code), server.arg("ship"));
    else credentials.shipment_code[0] = '\0';
    server.send(200, "text/html", "<html><head><meta charset='UTF-8'><meta http-equiv='refresh' content='2;url=/monitor'></head><body><h2 style='text-align:center; color:#27ae60; margin-top:50px;'>Đã nhận thông tin. ESP32 đang kết nối Wi-Fi và kích hoạt...</h2><p style='text-align:center;'>Đang chuyển đến trang giám sát...</p></body></html>");
    delay(800);
    web_config_done = true;
  } else {
    server.send(400, "text/plain", "Yêu cầu không hợp lệ: thiếu SSID hoặc mã kích hoạt.");
  }
}

// Gắn/đổi đơn ship khi thiết bị đang chạy (đã kích hoạt).
void handleRebind() {
  if (server.hasArg("ship") && server.arg("ship").length() > 0) {
    bool ok = rebindShipment(server.arg("ship"));
    String msg = ok ? "Đã gắn / đổi đơn ship thành công." : "Gắn đơn ship thất bại (kiểm tra mã đơn / kết nối).";
    server.send(200, "text/html", "<html><head><meta charset='UTF-8'><meta http-equiv='refresh' content='2;url=/monitor'></head><body><h2 style='text-align:center;margin-top:50px;color:#1f6feb'>" + msg + "</h2></body></html>");
  } else {
    server.send(400, "text/plain", "Yêu cầu không hợp lệ: thiếu mã đơn ship.");
  }
}

// Reset thiết bị (xóa credentials) -> vào lại luồng kích hoạt.
void handleReset() {
  server.send(200, "text/html", "<html><head><meta charset='UTF-8'></head><body><h2 style='text-align:center;margin-top:50px;color:#c53030'>Đang reset thiết bị và khởi động lại...</h2></body></html>");
  delay(600);
  factoryResetAndReboot();
}

void startWebPortal() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_SSID, AP_PASS);
  Serial.print("[AP] Da mo diem phat: ");
  Serial.println(AP_SSID);
  Serial.print("[AP] Truy cap: http://");
  Serial.println(WiFi.softAPIP());

  server.on("/", handleRoot);
  server.on("/monitor", handleMonitor);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/provision", HTTP_POST, handleProvision);
  server.on("/rebind", HTTP_POST, handleRebind);
  server.on("/reset", HTTP_POST, handleReset);
  server.begin();
}
#endif
