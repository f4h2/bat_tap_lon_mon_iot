#!/usr/bin/env python3
# ============================================================================
# portal_sim.py — Mô phỏng "thiết bị ESP32 ảo" + Web Portal ngay trên PC.
# Không cần phần cứng, không cần Arduino IDE.
#
# Nó dựng lại đúng luồng firmware:
#   - Kích hoạt: sinh khóa EC P-256, POST /api/devices/verify (mã kích hoạt)
#   - Gắn đơn ship: POST /api/devices/bind (ký ECDSA)
#   - Telemetry: gửi định kỳ có ký (khi đã gắn đơn)
# và cho bạn thao tác qua trình duyệt giống Web Portal thật.
#
# Yêu cầu: Python 3 + openssl trên PATH (chạy trong Git Bash là có sẵn openssl).
#
# Chạy:
#   BASE_URL=http://localhost:8080 python IoT/simulator/portal_sim.py
#   -> mở http://localhost:8090
# ============================================================================
import base64, hashlib, http.server, json, os, random, shutil, socketserver
import subprocess, tempfile, threading, time, urllib.error, urllib.request

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080").rstrip("/")
PORT = int(os.environ.get("SIM_PORT", "8090"))
OPENSSL = shutil.which("openssl") or "openssl"
INTERVAL = 10  # giây/telemetry (dưới mức rate limit 12/phút)

TMP = tempfile.mkdtemp(prefix="esp32sim_")
PRIV = os.path.join(TMP, "priv.pem")
PUB = os.path.join(TMP, "pub.pem")

state = {
    "device_id": "ESP32-SIM-" + base64.b16encode(os.urandom(3)).decode(),
    "api_key": None, "shipment_code": None,
    "activated": False, "sent_ok": 0, "sent_fail": 0, "last_http": "-", "msg": "Chưa kích hoạt.",
}
lock = threading.Lock()


def sh(args, inp=None):
    return subprocess.run(args, input=inp, capture_output=True)


def gen_keypair():
    sh([OPENSSL, "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", PRIV])
    sh([OPENSSL, "ec", "-in", PRIV, "-pubout", "-out", PUB])
    with open(PUB) as f:
        return f.read()


def sign_b64(canonical):
    p = sh([OPENSSL, "dgst", "-sha256", "-sign", PRIV], inp=canonical.encode())
    return base64.b64encode(p.stdout).decode()


def sha256_hex(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def post(path, raw, headers=None):
    req = urllib.request.Request(BASE_URL + path, data=raw.encode("utf-8"), method="POST")
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.getcode(), r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return 0, str(e)


def signed_post(path, payload):
    ts = str(int(time.time()))
    nonce = base64.b16encode(os.urandom(12)).decode()
    phash = sha256_hex(payload)
    canonical = "POST\n%s\n%s\n%s\n%s\n%s" % (path, state["device_id"], ts, nonce, phash)
    sig = sign_b64(canonical)
    return post(path, payload, {
        "X-Device-Id": state["device_id"], "X-Api-Key": state["api_key"],
        "X-Timestamp": ts, "X-Nonce": nonce, "X-Signature": sig,
    })


def do_activate(code):
    pub = gen_keypair()
    body = json.dumps({"device_id": state["device_id"], "verify_code": code, "public_key": pub})
    c, resp = post("/api/devices/verify", body)
    if c == 200:
        try:
            state["api_key"] = json.loads(resp)["api_key"]
            state["activated"] = True
            state["msg"] = "Đã kích hoạt. Hãy gắn đơn ship."
            return True, "Kích hoạt thành công."
        except Exception:
            pass
    return False, "Kích hoạt lỗi (%s): %s" % (c, resp[:200])


def do_bind(shipment):
    if not state["activated"]:
        return False, "Chưa kích hoạt."
    c, resp = signed_post("/api/devices/bind", json.dumps({"shipment_code": shipment}))
    if c == 200:
        state["shipment_code"] = shipment
        state["msg"] = "Đã gắn đơn ship %s. Đang gửi telemetry..." % shipment
        return True, "Gắn đơn ship thành công."
    return False, "Gắn đơn lỗi (%s): %s" % (c, resp[:200])


def telemetry_loop():
    while True:
        time.sleep(INTERVAL)
        with lock:
            if not (state["activated"] and state["shipment_code"]):
                continue
            payload = json.dumps({
                "shipment_code": state["shipment_code"],
                "temperature": round(random.uniform(-22, -18), 1),
                "humidity": round(random.uniform(45, 75), 1),
                "rssi": random.randint(-80, -60),
                "lat": round(10.7769 + random.uniform(-0.01, 0.01), 6),
                "lng": round(106.7009 + random.uniform(-0.01, 0.01), 6),
                "battery": random.randint(60, 95),
            })
            c, resp = signed_post("/api/telemetry", payload)
            state["last_http"] = c
            if c == 200:
                state["sent_ok"] += 1
            else:
                state["sent_fail"] += 1
                # 403 = bị bỏ gắn / đơn đã kết thúc / sai đơn -> DỪNG gửi, bỏ binding.
                if c == 403:
                    state["shipment_code"] = None
                    state["msg"] = "Backend tu choi (403): don da ket thuc hoac thiet bi bi bo gan. Da DUNG gui - hay gan don moi."


PAGE = """<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ESP32 Simulator</title><style>
body{font-family:"Segoe UI",Arial;background:radial-gradient(circle at 15% 20%,#1d6f8d,#0b172a 60%);
color:#11253a;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
.card{background:#f7fbff;border-radius:16px;padding:22px;max-width:460px;width:100%;box-shadow:0 18px 40px rgba(2,9,17,.35)}
h1{margin:0 0 4px;font-size:20px;color:#0f2c44}.sub{font-size:12px;color:#557;margin-bottom:14px}
label{display:block;font-size:13px;font-weight:700;color:#26435f;margin:10px 0 6px}
input{width:100%;padding:11px;border:1px solid #b7cce0;border-radius:10px;font-size:14px;box-sizing:border-box}
button{border:0;border-radius:10px;padding:11px 14px;font-weight:700;color:#fff;cursor:pointer;margin-top:12px}
.p{background:#e65f2b}.b{background:#1f6feb}.r{background:#c53030}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.item{background:#edf4ff;border-radius:10px;padding:9px}.k{font-size:11px;color:#557}.v{font-weight:800;color:#0f2c44}
.msg{margin-top:12px;padding:10px;border-radius:10px;background:#e9f4ff;font-size:13px;color:#26435f}
.mono{font-family:Consolas,monospace}</style></head><body>
<div class="card">
  <h1>ESP32 Web Portal — Simulator</h1>
  <div class="sub">Thiết bị ảo trên PC · Backend: __BASE__</div>
  <div class="item" style="margin-bottom:6px"><span class="k">Device ID</span><div class="v mono" id="did">-</div></div>

  <div id="s-act">
    <label>Mã kích hoạt</label>
    <input id="code" placeholder="VD: ACT-XXXXXXXX">
    <button class="p" onclick="act()">Kích hoạt thiết bị</button>
  </div>

  <div id="s-bind" style="display:none">
    <label>Mã đơn ship (gắn / đổi)</label>
    <input id="ship" placeholder="VD: SHIP-123">
    <button class="b" onclick="bind()">Gắn / Đổi đơn ship</button>
  </div>

  <div class="grid">
    <div class="item"><span class="k">Kích hoạt</span><div class="v" id="act">-</div></div>
    <div class="item"><span class="k">Đơn ship</span><div class="v mono" id="ship-v">-</div></div>
    <div class="item"><span class="k">Telemetry OK</span><div class="v" id="ok">0</div></div>
    <div class="item"><span class="k">HTTP cuối</span><div class="v" id="http">-</div></div>
  </div>
  <div class="msg" id="msg">...</div>
  <button class="r" onclick="reset()">Reset thiết bị</button>
</div>
<script>
async function refresh(){
  const d=await (await fetch('/sim/state')).json();
  did.textContent=d.device_id; act.textContent=d.activated?'Rồi':'Chưa';
  document.getElementById('ship-v').textContent=d.shipment_code||'Chưa gắn';
  ok.textContent=d.sent_ok; http.textContent=d.last_http; msg.textContent=d.msg;
  document.getElementById('s-act').style.display=d.activated?'none':'block';
  document.getElementById('s-bind').style.display=d.activated?'block':'none';
}
async function post(u,b){const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});return r.json();}
async function act(){msg.textContent='Đang kích hoạt...';const r=await post('/sim/activate',{code:code.value.trim()});msg.textContent=r.message;refresh();}
async function bind(){msg.textContent='Đang gắn...';const r=await post('/sim/bind',{shipment:ship.value.trim()});msg.textContent=r.message;refresh();}
async function reset(){await post('/sim/reset',{});refresh();}
refresh();setInterval(refresh,2000);
</script></body></html>"""


class Handler(http.server.BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        b = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == "/":
            self._send(200, PAGE.replace("__BASE__", BASE_URL), "text/html; charset=utf-8")
        elif self.path == "/sim/state":
            self._send(200, json.dumps(state))
        else:
            self._send(404, "{}")

    def do_POST(self):
        ln = int(self.headers.get("Content-Length", "0"))
        data = json.loads(self.rfile.read(ln) or "{}")
        with lock:
            if self.path == "/sim/activate":
                _, m = do_activate(data.get("code", ""))
                self._send(200, json.dumps({"message": m}))
            elif self.path == "/sim/bind":
                _, m = do_bind(data.get("shipment", ""))
                self._send(200, json.dumps({"message": m}))
            elif self.path == "/sim/reset":
                state.update(api_key=None, shipment_code=None, activated=False,
                             sent_ok=0, sent_fail=0, last_http="-", msg="Đã reset. Kích hoạt lại.")
                state["device_id"] = "ESP32-SIM-" + base64.b16encode(os.urandom(3)).decode()
                self._send(200, json.dumps({"message": "reset"}))
            else:
                self._send(404, "{}")

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    threading.Thread(target=telemetry_loop, daemon=True).start()
    print("ESP32 Simulator: http://localhost:%d   (backend: %s)" % (PORT, BASE_URL))
    print("Device ID:", state["device_id"])
    socketserver.ThreadingTCPServer(("0.0.0.0", PORT), Handler).serve_forever()
