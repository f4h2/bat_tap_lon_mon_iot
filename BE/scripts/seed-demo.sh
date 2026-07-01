#!/usr/bin/env bash
# ============================================================================
# seed-demo.sh — Giả lập ESP32 theo luồng MỚI (2 pha) để tạo dữ liệu cho dashboard:
#   Pha 1: Admin sinh MÃ KÍCH HOẠT -> thiết bị kích hoạt (đăng ký + nhận api_key)
#   Pha 2: Thiết bị GẮN vào đơn ship (POST /api/devices/bind, có ký)
#   Sau đó: gửi nhiều telemetry đã ký (có điểm vượt ngưỡng để sinh cảnh báo)
#
# Yêu cầu: bash, openssl, curl, python3 (Git Bash trên Windows là đủ).
# Backend đã bật Spring Security -> các API admin/query cần Basic auth.
#
# Dùng:
#   ./scripts/seed-demo.sh
#   N=40 SHIPMENT=SHIP-123 ./scripts/seed-demo.sh
#   ADMIN_USER=admin ADMIN_PASS=admin123 ./scripts/seed-demo.sh
# ============================================================================
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
SHIPMENT="${SHIPMENT:-SHIP-123}"
DEVICE_ID="${DEVICE_ID:-ESP32-DEMO-$(openssl rand -hex 3 | tr 'a-z' 'A-Z')}"
N="${N:-10}"   # backend giới hạn 12 req/phút/thiết bị -> mặc định 10 để chạy 1 lượt; N lớn sẽ tự giãn khi gặp 429
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-admin123}"

WORK="$(dirname "$0")/tmp"; mkdir -p "$WORK"
PRIV="$WORK/seed_priv.pem"; PUB="$WORK/seed_pub.pem"
CURL="curl"; command -v curl.exe >/dev/null 2>&1 && CURL="curl.exe"
ADMIN=(-u "$ADMIN_USER:$ADMIN_PASS")

echo "== Thiet bi gia lap: $DEVICE_ID  (se gan vao $SHIPMENT, $N ban ghi) =="

# --- Pha 1a: Admin sinh MÃ KÍCH HOẠT ---
echo "[1] Admin sinh ma kich hoat..."
GEN=$($CURL -s "${ADMIN[@]}" -X POST "$BASE_URL/api/admin/devices/generate-code" \
  -H 'Content-Type: application/json' --data-binary '{"expiresInDays":30}')
ACT_CODE=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["verifyCode"])' "$GEN") \
  || { echo "Loi sinh ma kich hoat (dang nhap admin?): $GEN"; exit 1; }
echo "    activation_code = $ACT_CODE"

# --- Sinh khóa EC P-256 ---
openssl ecparam -name prime256v1 -genkey -noout -out "$PRIV" 2>/dev/null
openssl ec -in "$PRIV" -pubout -out "$PUB" 2>/dev/null
PUBKEY_JSON=$(python3 -c 'import json,sys;print(json.dumps(open(sys.argv[1]).read()))' "$PUB")

# --- Pha 1b: Thiết bị KÍCH HOẠT (không cần auth admin) ---
echo "[2] Thiet bi kich hoat /api/devices/verify..."
ACT=$($CURL -s -X POST "$BASE_URL/api/devices/verify" \
  -H 'Content-Type: application/json' \
  --data-binary "{\"device_id\":\"$DEVICE_ID\",\"verify_code\":\"$ACT_CODE\",\"public_key\":$PUBKEY_JSON}")
API_KEY=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["api_key"])' "$ACT") \
  || { echo "Kich hoat that bai: $ACT"; exit 1; }
echo "    api_key = ${API_KEY:0:16}..."

# Ký 1 canonical request (POST\n{path}\n{device}\n{ts}\n{nonce}\n{payload_hash}) -> Base64
sign_and_send() {  # $1=path  $2=payload  $3..=extra curl headers
  local path="$1"; local payload="$2"; shift 2
  local ts nonce phash canon sig
  ts=$(date +%s)
  nonce=$(openssl rand -hex 12)
  phash=$(printf '%s' "$payload" | openssl dgst -sha256 -hex | awk '{print $NF}')
  canon=$(printf "POST\n%s\n%s\n%s\n%s\n%s" "$path" "$DEVICE_ID" "$ts" "$nonce" "$phash")
  sig=$(printf '%s' "$canon" | openssl dgst -sha256 -sign "$PRIV" | openssl base64 -A)
  $CURL -s -X POST "$BASE_URL$path" \
    -H 'Content-Type: application/json' \
    -H "X-Device-Id: $DEVICE_ID" -H "X-Api-Key: $API_KEY" \
    -H "X-Timestamp: $ts" -H "X-Nonce: $nonce" -H "X-Signature: $sig" \
    "$@" --data-binary "$payload"
}

# --- Pha 2: Thiết bị GẮN vào đơn ship (có ký) ---
echo "[3] Thiet bi gan vao don ship $SHIPMENT /api/devices/bind..."
BIND=$(sign_and_send "/api/devices/bind" "{\"shipment_code\":\"$SHIPMENT\"}")
python3 -c 'import json,sys;d=json.loads(sys.argv[1]);print("    bound ->",d["shipment_code"])' "$BIND" \
  || { echo "Gan don ship that bai: $BIND"; exit 1; }

# --- Gửi N telemetry đã ký ---
echo "[4] Gui $N ban ghi telemetry..."
OK=0
for i in $(seq 0 $((N - 1))); do
  read TEMP HUM BAT RSSI LAT LNG <<EOF
$(awk -v i="$i" 'BEGIN{
  temp=-20 + ((i%5)-2)*0.4; hum=60 + ((i%7)-3)*3; bat=96 - i*2; rssi=-65 - (i%6)*3;
  lat=10.7769 + i*0.0009; lng=106.7009 + i*0.0011;
  if(i==6)  temp=-16.8; if(i==12) temp=-23.6; if(i==15) hum=86; if(i==18) rssi=-91; if(i==20) bat=14;
  printf "%.1f %.1f %d %d %.6f %.6f", temp, hum, bat, rssi, lat, lng;
}')
EOF
  PAYLOAD="{\"shipment_code\":\"$SHIPMENT\",\"temperature\":$TEMP,\"humidity\":$HUM,\"rssi\":$RSSI,\"lat\":$LAT,\"lng\":$LNG,\"battery\":$BAT}"
  attempt=0
  while :; do
    CODE=$(sign_and_send "/api/telemetry" "$PAYLOAD" -o /dev/null -w "%{http_code}")
    if [ "$CODE" = "200" ]; then OK=$((OK + 1)); break; fi
    if [ "$CODE" = "429" ] && [ "$attempt" -lt 6 ]; then attempt=$((attempt + 1)); sleep 5; continue; fi
    echo "    ! ban ghi $i loi HTTP $CODE"; break
  done
done

echo "[5] Hoan tat: $OK/$N ban ghi thanh cong."
echo "== Dashboard stats =="
$CURL -s "${ADMIN[@]}" "$BASE_URL/api/admin/dashboard/stats"; echo
echo "Mo http://localhost:8080/ (admin/admin123) -> tab Giam sat -> chon $SHIPMENT"
