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
    <h1>Kich hoat thiet bi ESP32</h1>
    <div class="device">Device ID: {{DEVICE_ID}}</div>
    <form action="/save-wifi" method="POST">
      <div class="group">
        <label>Wi-Fi SSID</label>
        <input type="text" name="ssid" placeholder="Nhap ten Wi-Fi" required>
      </div>
      <div class="group">
        <label>Wi-Fi Password</label>
        <input type="password" name="password" placeholder="Nhap mat khau Wi-Fi">
      </div>
      <div class="actions">
        <button class="primary" type="submit">Luu Wi-Fi va sang buoc Verify</button>
      </div>
    </form>
  </div>
</body>
</html>
)rawliteral";

const char HTML_VERIFY[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ESP32 Verify Code</title>
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
    .hint {
      font-size: 12px;
      color: #476887;
      margin-bottom: 12px;
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
    <h1>Buoc 2: Verify voi Backend</h1>
    <div class="device">Device ID: {{DEVICE_ID}}</div>
    <div class="hint">Sau khi bam nut, ESP32 se goi POST /api/devices/verify voi device_id + verify_code + public_key.</div>
    <form action="/save-verify" method="POST">
      <div class="group">
        <label>Verify Code</label>
        <input id="verifyCode" type="text" name="vcode" placeholder="Nhap hoac quet verify code" required>
        <video id="preview" autoplay playsinline></video>
        <div id="scanResult"></div>
      </div>
      <div class="actions">
        <button class="secondary" type="button" onclick="scanCode()">Quet verify code</button>
        <button class="primary" type="submit">Bat dau Provisioning</button>
      </div>
    </form>
  </div>
  <script>
    async function scanCode() {
      const resultEl = document.getElementById('scanResult');
      const verifyInput = document.getElementById('verifyCode');
      const video = document.getElementById('preview');

      if (!('BarcodeDetector' in window)) {
        resultEl.innerText = 'Trinh duyet khong ho tro BarcodeDetector. Vui long nhap tay.';
        return;
      }

      let stream;
      try {
        const detector = new BarcodeDetector({formats: ['qr_code', 'code_128', 'code_39']});
        stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}});
        video.srcObject = stream;
        video.style.display = 'block';
        resultEl.innerText = 'Dang quet...';

        const startedAt = Date.now();
        const timeoutMs = 15000;
        while (Date.now() - startedAt < timeoutMs) {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            verifyInput.value = barcodes[0].rawValue;
            resultEl.innerText = 'Da quet thanh cong.';
            break;
          }
          await new Promise((r) => setTimeout(r, 220));
        }

        if (!verifyInput.value) {
          resultEl.innerText = 'Khong quet duoc trong 15 giay. Vui long nhap tay.';
        }
      } catch (e) {
        resultEl.innerText = 'Khong mo duoc camera. Vui long nhap tay.';
      } finally {
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
        }
        video.style.display = 'none';
      }
    }
  </script>
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
    <h1>Trang thai truyen du lieu</h1>
    <div class="grid">
      <div class="item"><span class="label">Device ID</span><div id="device" class="value">-</div></div>
      <div class="item"><span class="label">Wi-Fi</span><div id="wifi" class="value">-</div></div>
      <div class="item"><span class="label">Provisioning</span><div id="prov" class="value">-</div></div>
      <div class="item"><span class="label">Telemetry thanh cong</span><div id="ok" class="value">0</div></div>
      <div class="item"><span class="label">Telemetry loi</span><div id="fail" class="value">0</div></div>
      <div class="item"><span class="label">HTTP cuoi</span><div id="http" class="value">-</div></div>
      <div class="item"><span class="label">Lan gui cuoi (ms)</span><div id="last" class="value">-</div></div>
      <div class="item"><span class="label">Thong bao</span><div id="msg" class="value">Dang cho du lieu...</div></div>
    </div>
    <div class="note">Trang tu dong cap nhat moi 2 giay.</div>
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
        setStatus(document.getElementById('wifi'), d.wifi_connected ? 1 : -1, d.wifi_connected ? 'Da ket noi' : 'Mat ket noi');
        setStatus(document.getElementById('prov'), d.provisioned ? 1 : 0, d.provisioned ? 'Da provision' : 'Dang provisioning');
        document.getElementById('ok').textContent = String(d.telemetry_ok || 0);
        document.getElementById('fail').textContent = String(d.telemetry_fail || 0);
        document.getElementById('http').textContent = String(d.last_http_code || 0);
        document.getElementById('last').textContent = String(d.last_send_ms || 0);

        if ((d.telemetry_ok || 0) > 0) {
          document.getElementById('msg').textContent = 'ESP32 dang gui telemetry binh thuong.';
        } else if (!d.wifi_connected) {
          document.getElementById('msg').textContent = 'Chua co Wi-Fi, ESP32 dang thu ket noi lai.';
        } else {
          document.getElementById('msg').textContent = 'Da co Wi-Fi, dang cho ban tin telemetry dau tien...';
        }
      } catch (e) {
        document.getElementById('msg').textContent = 'Khong doc duoc /status (co the ESP32 dang reboot).';
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
  server.send(200, "text/html", html);
}

void handleVerifyPage() {
  String html = HTML_VERIFY;
  html.replace("{{DEVICE_ID}}", device_id);
  server.send(200, "text/html", html);
}

void handleMonitor() {
  server.send(200, "text/html", HTML_MONITOR);
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

void handleSaveWiFi() {
  if (server.hasArg("ssid")) {
    safeCopy(credentials.wifi_ssid, sizeof(credentials.wifi_ssid), server.arg("ssid"));
    safeCopy(credentials.wifi_pass, sizeof(credentials.wifi_pass), server.arg("password"));
    String html_resp = "<html><head><meta charset='UTF-8'><meta http-equiv='refresh' content='0;url=/verify'></head><body><h2 style='text-align:center; color:#1f6feb; margin-top:50px;'>Da luu Wi-Fi. Chuyen sang buoc nhap verify code...</h2></body></html>";
    server.send(200, "text/html", html_resp);
  } else {
    server.send(400, "text/plain", "Bad Request: thieu SSID.");
  }
}

void handleSaveVerify() {
  if (server.hasArg("vcode")) {
    safeCopy(credentials.verify_code, sizeof(credentials.verify_code), server.arg("vcode"));
    String html_resp = "<html><head><meta charset='UTF-8'><meta http-equiv='refresh' content='2;url=/monitor'></head><body><h2 style='text-align:center; color:#27ae60; margin-top:50px;'>Da nhan verify code. ESP32 dang ket noi mang va goi /api/devices/verify...</h2><p style='text-align:center;'>Dang chuyen den trang giam sat...</p></body></html>";
    server.send(200, "text/html", html_resp);
    delay(800);
    web_config_done = true;
  } else {
    server.send(400, "text/plain", "Bad Request: thieu verify code.");
  }
}

void startWebPortal() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_SSID, AP_PASS);
  Serial.print("[AP] Da mo diem phat: ");
  Serial.println(AP_SSID);
  Serial.print("[AP] Truy cap: http://");
  Serial.println(WiFi.softAPIP());

  server.on("/", handleRoot);
  server.on("/verify", handleVerifyPage);
  server.on("/monitor", handleMonitor);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/save-wifi", HTTP_POST, handleSaveWiFi);
  server.on("/save-verify", HTTP_POST, handleSaveVerify);
  server.begin();
}
#endif
