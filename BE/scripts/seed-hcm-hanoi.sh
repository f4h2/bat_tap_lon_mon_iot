#!/usr/bin/env bash
# ============================================================================
# seed-hcm-hanoi.sh — Bơm dữ liệu demo cho chuyến hàng đông lạnh TP.HCM -> Hà Nội.
#
# Đọc sheet dữ liệu docs/data/shipment-hcm-hanoi.csv (32 điểm bám QL1A, 42 giờ chạy)
# rồi giả lập ESP32 gửi telemetry ĐÃ KÝ ECDSA theo đúng luồng 2 pha:
#   Pha 0: Admin tạo đơn ship SHIP-HCM-HN (ngưỡng -22..-18 C, ẩm 40..80 %)
#   Pha 1: Admin sinh mã kích hoạt -> thiết bị kích hoạt, nhận api_key
#   Pha 2: Thiết bị gắn vào đơn ship rồi gửi lần lượt 32 bản ghi telemetry
#
# Sheet cài sẵn 6 vi phạm để dashboard sinh cảnh báo:
#   3 lần mở cửa khoang (nhiệt vượt -18), 2 lần máy nén quá lạnh (dưới -22),
#   1 lần gioăng hở (ẩm 88%), kèm pin tụt dần xuống dưới 20% ở cuối chặng.
#
# Yêu cầu: bash, openssl, curl, python3.
# Backend giới hạn 12 request/phút/thiết bị -> script tự chờ khi gặp HTTP 429,
# nên chạy đủ 32 bản ghi mất khoảng 3 phút.
#
# Dùng:
#   ./scripts/seed-hcm-hanoi.sh
#   ADMIN_USER=admin ADMIN_PASS=admin123 ./scripts/seed-hcm-hanoi.sh
#   CSV=/duong/dan/khac.csv ./scripts/seed-hcm-hanoi.sh
# ============================================================================
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
SHIPMENT="${SHIPMENT:-SHIP-HCM-HN}"
ITEM_TYPE="${ITEM_TYPE:-Thủy sản đông lạnh (TP.HCM -> Hà Nội)}"
MIN_TEMP="${MIN_TEMP:--22}"
MAX_TEMP="${MAX_TEMP:--18}"
MIN_HUM="${MIN_HUM:-40}"
MAX_HUM="${MAX_HUM:-80}"
DEVICE_ID="${DEVICE_ID:-ESP32-HCMHN-$(openssl rand -hex 3 | tr 'a-z' 'A-Z')}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-admin123}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CSV="${CSV:-$SCRIPT_DIR/../../docs/data/shipment-hcm-hanoi.csv}"
[ -f "$CSV" ] || { echo "Khong tim thay sheet du lieu: $CSV"; exit 1; }

WORK="$SCRIPT_DIR/tmp"; mkdir -p "$WORK"
PRIV="$WORK/hcmhn_priv.pem"; PUB="$WORK/hcmhn_pub.pem"
CURL="curl"; command -v curl.exe >/dev/null 2>&1 && CURL="curl.exe"
ADMIN=(-u "$ADMIN_USER:$ADMIN_PASS")

TOTAL=$(($(wc -l < "$CSV") - 1))
echo "== Chuyen hang $SHIPMENT | thiet bi $DEVICE_ID | $TOTAL ban ghi tu $(basename "$CSV") =="

# --- Pha 0: tạo đơn ship (bỏ qua nếu đã tồn tại) ---
echo "[1] Tao don ship $SHIPMENT..."
SHIP_BODY=$(python3 -c '
import json,sys
print(json.dumps({"shipmentCode":sys.argv[1],"itemType":sys.argv[2],
 "minTemperature":float(sys.argv[3]),"maxTemperature":float(sys.argv[4]),
 "minHumidity":float(sys.argv[5]),"maxHumidity":float(sys.argv[6])}))
' "$SHIPMENT" "$ITEM_TYPE" "$MIN_TEMP" "$MAX_TEMP" "$MIN_HUM" "$MAX_HUM")
CODE=$($CURL -s "${ADMIN[@]}" -o "$WORK/ship.json" -w "%{http_code}" \
  -X POST "$BASE_URL/api/admin/shipments" -H 'Content-Type: application/json' --data-binary "$SHIP_BODY")
case "$CODE" in
  200|201) echo "    da tao moi" ;;
  409|400)  echo "    da ton tai tu truoc, dung lai don ship cu" ;;
  *) echo "    ! loi HTTP $CODE khi tao don ship:"; cat "$WORK/ship.json"; echo; exit 1 ;;
esac

# --- Pha 1a: Admin sinh mã kích hoạt ---
echo "[2] Admin sinh ma kich hoat..."
GEN=$($CURL -s "${ADMIN[@]}" -X POST "$BASE_URL/api/admin/devices/generate-code" \
  -H 'Content-Type: application/json' --data-binary '{"expiresInDays":30}')
ACT_CODE=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["verifyCode"])' "$GEN") \
  || { echo "Loi sinh ma kich hoat (dang nhap admin?): $GEN"; exit 1; }
echo "    activation_code = $ACT_CODE"

# --- Sinh khóa EC P-256 (giả lập việc ESP32 tự sinh khóa trong chip) ---
openssl ecparam -name prime256v1 -genkey -noout -out "$PRIV" 2>/dev/null
openssl ec -in "$PRIV" -pubout -out "$PUB" 2>/dev/null
PUBKEY_JSON=$(python3 -c 'import json,sys;print(json.dumps(open(sys.argv[1]).read()))' "$PUB")

# --- Pha 1b: thiết bị kích hoạt ---
echo "[3] Thiet bi kich hoat /api/devices/verify..."
ACT=$($CURL -s -X POST "$BASE_URL/api/devices/verify" \
  -H 'Content-Type: application/json' \
  --data-binary "{\"device_id\":\"$DEVICE_ID\",\"verify_code\":\"$ACT_CODE\",\"public_key\":$PUBKEY_JSON}")
API_KEY=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["api_key"])' "$ACT") \
  || { echo "Kich hoat that bai: $ACT"; exit 1; }
echo "    api_key = ${API_KEY:0:16}..."

# Ký canonical request: POST\n{path}\n{device}\n{ts}\n{nonce}\n{sha256(payload)} -> Base64
sign_and_send() {
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

# --- Pha 2: gắn thiết bị vào đơn ship ---
echo "[4] Thiet bi gan vao don ship /api/devices/bind..."
BIND=$(sign_and_send "/api/devices/bind" "{\"shipment_code\":\"$SHIPMENT\"}")
python3 -c 'import json,sys;print("    bound ->",json.loads(sys.argv[1])["shipment_code"])' "$BIND" \
  || { echo "Gan don ship that bai: $BIND"; exit 1; }

# --- Gửi telemetry theo từng dòng của sheet ---
echo "[5] Gui $TOTAL ban ghi telemetry theo lo trinh QL1A..."
# Tách cột bằng python (tên địa danh có thể chứa dấu phẩy) ra file tạm,
# đọc bằng redirect thay vì pipe để biến đếm OK không nằm trong subshell.
ROWS="$WORK/hcmhn_rows.tsv"
python3 -c '
import csv, sys
with open(sys.argv[1], encoding="utf-8") as f:
    out = open(sys.argv[2], "w", encoding="utf-8")
    for r in csv.DictReader(f):
        out.write("\t".join([r["seq"], r["lat"], r["lng"], r["temperature_c"],
                             r["humidity_pct"], r["battery_pct"], r["location"], r["event"]]) + "\n")
' "$CSV" "$ROWS"

OK=0
while IFS=$'\t' read -r SEQ LAT LNG TEMP HUM BAT PLACE EVENT; do
  PAYLOAD="{\"shipment_code\":\"$SHIPMENT\",\"temperature\":$TEMP,\"humidity\":$HUM,\"lat\":$LAT,\"lng\":$LNG,\"battery\":$BAT}"
  attempt=0
  while :; do
    CODE=$(sign_and_send "/api/telemetry" "$PAYLOAD" -o /dev/null -w "%{http_code}")
    if [ "$CODE" = "200" ]; then
      OK=$((OK + 1))
      if [ -n "${EVENT:-}" ]; then printf '    [%2s] %-20s %6s C  %5s %%  ! %s\n' "$SEQ" "$PLACE" "$TEMP" "$HUM" "$EVENT"
      else printf '    [%2s] %-20s %6s C  %5s %%\n' "$SEQ" "$PLACE" "$TEMP" "$HUM"; fi
      break
    fi
    # Backend giới hạn 12 request/phút/thiết bị -> chờ rồi thử lại.
    if [ "$CODE" = "429" ] && [ "$attempt" -lt 12 ]; then attempt=$((attempt + 1)); sleep 5; continue; fi
    echo "    ! ban ghi $SEQ loi HTTP $CODE"; break
  done
done < "$ROWS"

echo "[6] Hoan tat: $OK/$TOTAL ban ghi thanh cong."
echo "== Canh bao cua chuyen hang =="
$CURL -s "${ADMIN[@]}" "$BASE_URL/api/shipments/$SHIPMENT/alerts?size=50" \
  | python3 -c '
import json, sys
d = json.load(sys.stdin)
items = d["content"] if isinstance(d, dict) and "content" in d else d
print("  tong %d canh bao" % len(items))
for a in items[:10]:
    print("  - [%s] %s: %s" % (a.get("level"), a.get("type"), a.get("message")))
' || echo "  (khong doc duoc alert)"
echo
echo "Mo $BASE_URL/ (admin/admin123) -> tab Giam sat -> chon $SHIPMENT"
echo "Bam 'Xem lo trinh di chuyen' de xem xe chay 3D tu TP.HCM ra Ha Noi."
