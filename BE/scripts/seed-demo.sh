#!/usr/bin/env bash
# ============================================================================
# seed-demo.sh — Giả lập 1 thiết bị ESP32 và bơm nhiều bản ghi telemetry đã ký
# để Admin Dashboard có dữ liệu hiển thị (biểu đồ, lộ trình GPS, cảnh báo).
#
# Khác với demo-flow.sh (chỉ gửi 1 bản ghi), script này:
#   - Tự sinh verify code mới qua API admin (không tốn mã seed sẵn)
#   - Provision thiết bị, nhận api_key
#   - Gửi N bản ghi: GPS di chuyển, nhiệt độ/độ ẩm biến thiên, có vài điểm
#     vượt ngưỡng để kích hoạt đủ 4 loại cảnh báo
#
# Yêu cầu: bash, openssl, curl, python3 (Git Bash trên Windows là đủ).
#
# Dùng:
#   ./scripts/seed-demo.sh                 # mặc định: shipment SHIP-123, 24 bản ghi
#   N=40 ./scripts/seed-demo.sh            # gửi 40 bản ghi
#   SHIPMENT=SHIP-456 ./scripts/seed-demo.sh
#   BASE_URL=http://localhost:8080 ./scripts/seed-demo.sh
# ============================================================================
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
SHIPMENT="${SHIPMENT:-SHIP-123}"
DEVICE_ID="${DEVICE_ID:-ESP32-DEMO-$(openssl rand -hex 3 | tr 'a-z' 'A-Z')}"
N="${N:-24}"

WORK="$(dirname "$0")/tmp"
mkdir -p "$WORK"
PRIV="$WORK/seed_priv.pem"
PUB="$WORK/seed_pub.pem"

# curl.exe để tránh alias 'curl' của PowerShell khi chạy qua một số shell trên Windows.
CURL="curl"; command -v curl.exe >/dev/null 2>&1 && CURL="curl.exe"

echo "== Thiet bi gia lap: $DEVICE_ID  (shipment $SHIPMENT, $N ban ghi) =="

# 1. Admin sinh verify code mới cho shipment
echo "[1] Sinh verify code..."
GEN=$($CURL -s -X POST "$BASE_URL/api/admin/devices/generate-code" \
  -H 'Content-Type: application/json' \
  --data-binary "{\"shipmentCode\":\"$SHIPMENT\",\"expiresInDays\":7}")
VERIFY_CODE=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["verifyCode"])' "$GEN") \
  || { echo "Loi sinh verify code (shipment ton tai chua?): $GEN"; exit 1; }
echo "    verify_code = $VERIFY_CODE"

# 2. Sinh cặp khóa EC P-256
openssl ecparam -name prime256v1 -genkey -noout -out "$PRIV" 2>/dev/null
openssl ec -in "$PRIV" -pubout -out "$PUB" 2>/dev/null
PUBKEY_JSON=$(python3 -c 'import json,sys;print(json.dumps(open(sys.argv[1]).read()))' "$PUB")

# 3. Provision -> nhận api_key
echo "[2] Provision /api/devices/verify..."
PROV=$($CURL -s -X POST "$BASE_URL/api/devices/verify" \
  -H 'Content-Type: application/json' \
  --data-binary "{\"device_id\":\"$DEVICE_ID\",\"verify_code\":\"$VERIFY_CODE\",\"public_key\":$PUBKEY_JSON}")
API_KEY=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["api_key"])' "$PROV") \
  || { echo "Provision that bai: $PROV"; exit 1; }
echo "    api_key = ${API_KEY:0:16}..."

# 4. Gửi N bản ghi telemetry đã ký (ECDSA-SHA256 trên canonical request)
echo "[3] Gui $N ban ghi telemetry..."
NOW=$(date +%s)
OK=0
for i in $(seq 0 $((N - 1))); do
  # Giá trị mặc định nằm trong ngưỡng, biến thiên mượt theo i.
  read TEMP HUM BAT RSSI LAT LNG <<EOF
$(awk -v i="$i" 'BEGIN{
  temp=-20 + ((i%5)-2)*0.4;
  hum=60 + ((i%7)-3)*3;
  bat=96 - i*2;
  rssi=-65 - (i%6)*3;
  lat=10.7769 + i*0.0009;
  lng=106.7009 + i*0.0011;
  # Chèn các điểm vượt ngưỡng để sinh cảnh báo (xem AlertService):
  if(i==6)  temp=-16.8;   # > max -18  -> TEMP_OUT_OF_RANGE (HIGH)
  if(i==12) temp=-23.6;   # < min -22  -> TEMP_OUT_OF_RANGE (HIGH)
  if(i==15) hum=86;       # > 80       -> HUMIDITY_OUT_OF_RANGE (WARNING)
  if(i==18) rssi=-91;     # < -85      -> WEAK_SIGNAL (WARNING)
  if(i==20) bat=14;       # < 20       -> LOW_BATTERY (WARNING)
  printf "%.1f %.1f %d %d %.6f %.6f", temp, hum, bat, rssi, lat, lng;
}')
EOF

  # Timestamp trải đều ~10s/bản ghi, kết thúc ở hiện tại -> nằm trong cửa sổ skew 300s.
  TS=$((NOW - (N - i) * 10))
  NONCE=$(openssl rand -hex 12)
  PAYLOAD="{\"shipment_code\":\"$SHIPMENT\",\"temperature\":$TEMP,\"humidity\":$HUM,\"rssi\":$RSSI,\"lat\":$LAT,\"lng\":$LNG,\"battery\":$BAT}"
  PHASH=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hex | awk '{print $NF}')
  CANON=$(printf "POST\n/api/telemetry\n%s\n%s\n%s\n%s" "$DEVICE_ID" "$TS" "$NONCE" "$PHASH")
  SIG=$(printf '%s' "$CANON" | openssl dgst -sha256 -sign "$PRIV" | openssl base64 -A)

  CODE=$($CURL -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/telemetry" \
    -H 'Content-Type: application/json' \
    -H "X-Device-Id: $DEVICE_ID" -H "X-Api-Key: $API_KEY" \
    -H "X-Timestamp: $TS" -H "X-Nonce: $NONCE" -H "X-Signature: $SIG" \
    --data-binary "$PAYLOAD")
  if [ "$CODE" = "200" ]; then OK=$((OK + 1)); else echo "    ! ban ghi $i loi HTTP $CODE"; fi
done

echo "[4] Hoan tat: $OK/$N ban ghi thanh cong."
echo "== Dashboard stats =="
$CURL -s "$BASE_URL/api/admin/dashboard/stats"; echo
echo "Mo http://localhost:8080/ -> tab Giam sat -> chon $SHIPMENT"
