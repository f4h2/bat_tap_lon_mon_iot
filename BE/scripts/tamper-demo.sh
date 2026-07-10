#!/usr/bin/env bash
# ============================================================================
# tamper-demo.sh — Demo phản chứng: sửa thẳng dữ liệu trong PostgreSQL rồi để
# hệ thống tự phát hiện. Dùng khi trình bày phần "chống sửa đổi dữ liệu".
#
# Backend kiểm tra 6 lớp mỗi khi đọc telemetry (ShipmentQueryService.verifyIntegrity):
#   1. payload_hash      = SHA256(raw_payload)
#   2. các cột hiển thị  khớp với raw_payload
#   3. record_hash       = HMAC(secret, device|ts|payload_hash|signature|previous_hash)
#   4. previous_hash     nối đúng chuỗi
#   5. canonical_request khớp các trường đã ký
#   6. chữ ký ECDSA      hợp lệ với public key đã ký bản ghi đó
#
# Mỗi kịch bản dưới đây làm sáng một nhóm đèn khác nhau:
#
#   MODE=column   Sửa cột temperature, giữ nguyên raw_payload.
#                 -> COLUMN_MISMATCH:temperature
#                 Kẻ tấn công "làm đẹp" số liệu hiển thị nhưng quên bản gốc.
#
#   MODE=payload  Sửa nhiệt độ bên trong raw_payload, giữ nguyên payload_hash.
#                 -> PAYLOAD_HASH_MISMATCH + COLUMN_MISMATCH
#                 Sửa bản gốc nhưng không tính lại được hash.
#
#   MODE=full     Sửa raw_payload + cột + payload_hash (kẻ tấn công biết SHA256).
#                 -> RECORD_HASH_MISMATCH + CANONICAL_MISMATCH + SIGNATURE_INVALID
#                 Đây là điểm mấu chốt: record_hash dùng HMAC với khóa nằm NGOÀI DB,
#                 và chữ ký ECDSA cần private key nằm trong ESP32 -> không giả được.
#
#   MODE=delete   Xóa một bản ghi giữa chuỗi.
#                 -> CHAIN_BROKEN ở bản ghi kế tiếp.
#
#   MODE=restore  Khôi phục bản ghi từ bản sao lưu do chính script tạo.
#
# Yêu cầu: docker compose đang chạy (container coldchain-postgres), curl, python3.
#
# Dùng:
#   ./scripts/tamper-demo.sh                       # MODE=column, đơn SHIP-HCM-HN
#   MODE=full ./scripts/tamper-demo.sh
#   MODE=delete SHIPMENT=SHIP-123 ./scripts/tamper-demo.sh
#   MODE=restore ./scripts/tamper-demo.sh
# ============================================================================
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
SHIPMENT="${SHIPMENT:-SHIP-HCM-HN}"
MODE="${MODE:-column}"
FAKE_TEMP="${FAKE_TEMP:--19.5}"     # nhiệt độ "đẹp" mà kẻ tấn công muốn ghi đè
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-admin123}"
PG_CONTAINER="${PG_CONTAINER:-coldchain-postgres}"
PG_USER="${PG_USER:-coldchain}"
PG_DB="${PG_DB:-iot_cold_chain}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="$SCRIPT_DIR/tmp"; mkdir -p "$WORK"
BACKUP="$WORK/tamper_backup_${SHIPMENT}.sql"
CURL="curl"; command -v curl.exe >/dev/null 2>&1 && CURL="curl.exe"
ADMIN=(-u "$ADMIN_USER:$ADMIN_PASS")

docker exec "$PG_CONTAINER" true 2>/dev/null \
  || { echo "Khong thay container '$PG_CONTAINER'. Chay: cd BE && docker compose up -d"; exit 1; }

# psql: chạy câu lệnh, trả về kết quả thô (không header, không viền).
psql_q() { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -At -c "$1"; }
psql_x() { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -q -c "$1"; }

# Bản ghi bị vi phạm ngưỡng (nhiệt cao nhất) là mục tiêu tự nhiên nhất để "che giấu".
pick_target() {
  psql_q "select id from telemetry_records
          where shipment_code = '$SHIPMENT'
          order by temperature desc nulls last, device_timestamp asc
          limit 1;"
}

show_record() {  # $1 = id
  echo "    --- Ban ghi trong DB ---"
  psql_q "select 'temperature (cot) = ' || coalesce(temperature::text,'null') ||
                 E'\n    raw_payload       = ' || left(raw_payload, 96) ||
                 E'\n    payload_hash      = ' || left(payload_hash, 24) || '...' ||
                 E'\n    record_hash       = ' || left(record_hash, 24) || '...'
          from telemetry_records where id = '$1';" | sed 's/^/    /'
}

# Gọi API và đếm bản ghi bị đánh dấu tampered + liệt kê vấn đề.
check_integrity() {
  echo
  echo "== He thong kiem tra lai (GET /api/shipments/$SHIPMENT/telemetry) =="
  $CURL -s "${ADMIN[@]}" "$BASE_URL/api/shipments/$SHIPMENT/telemetry?size=200" | python3 -c '
import json, sys
d = json.load(sys.stdin)
items = d["content"] if isinstance(d, dict) and "content" in d else d
bad = [t for t in items if t.get("tampered")]
print("  tong %d ban ghi, %d bi danh dau DA SUA" % (len(items), len(bad)))
for t in bad[:5]:
    issues = ", ".join(t.get("integrity_issues") or [])
    print("  - %s | %s C | %s" % (str(t.get("device_timestamp")), t.get("temperature"), issues))
' || echo "  (backend chua chay? mo $BASE_URL truoc)"
  echo
  echo "== Diem doi soat (GET /api/admin/integrity/status) =="
  $CURL -s "${ADMIN[@]}" "$BASE_URL/api/admin/integrity/status" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print("  ok=%s | %s" % (d.get("ok"), d.get("message")))
print("  tong %s ban ghi, %s bi sua" % (d.get("totalRecords"), d.get("tamperedRecords")))
' || true
}

# ---------- restore ----------
if [ "$MODE" = "restore" ]; then
  [ -f "$BACKUP" ] || { echo "Khong co ban sao luu $BACKUP (chua tamper lan nao?)"; exit 1; }
  echo "== Khoi phuc ban ghi tu $BACKUP =="
  docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -q < "$BACKUP"
  rm -f "$BACKUP"
  echo "    da khoi phuc."
  check_integrity
  exit 0
fi

TARGET=$(pick_target)
[ -n "$TARGET" ] || { echo "Khong tim thay telemetry cua $SHIPMENT. Chay seed truoc."; exit 1; }

echo "== Muc tieu: ban ghi $TARGET cua $SHIPMENT (nhiet do cao nhat = vi pham nguong) =="
echo "[1] Truoc khi sua:"
show_record "$TARGET"

# ---------- sao lưu để còn khôi phục ----------
# Sinh câu UPDATE hoàn nguyên đúng 4 cột mà script có thể đụng tới.
echo "[2] Sao luu ban ghi -> $BACKUP"
psql_q "select format(
    'update telemetry_records set temperature=%L, raw_payload=%L, payload_hash=%L, record_hash=%L where id=%L;',
    temperature, raw_payload, payload_hash, record_hash, id)
  from telemetry_records where id = '$TARGET';" > "$BACKUP"
if [ "$MODE" = "delete" ]; then
  # Với delete phải sinh INSERT đầy đủ thay vì UPDATE.
  psql_q "select format(
      'insert into telemetry_records (id,device_id,shipment_code,temperature,humidity,rssi,lat,lng,battery,raw_payload,signature,payload_hash,previous_hash,record_hash,canonical_request,device_timestamp,nonce,created_at) values (%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L);',
      id,device_id,shipment_code,temperature,humidity,rssi,lat,lng,battery,raw_payload,signature,payload_hash,previous_hash,record_hash,canonical_request,device_timestamp,nonce,created_at)
    from telemetry_records where id = '$TARGET';" > "$BACKUP"
fi

echo "[3] Ke tan cong sua DB (MODE=$MODE)..."
case "$MODE" in
  column)
    # Chỉ đổi cột hiển thị, raw_payload vẫn là bản gốc.
    psql_x "update telemetry_records set temperature = $FAKE_TEMP where id = '$TARGET';"
    echo "    da doi cot temperature -> $FAKE_TEMP (raw_payload giu nguyen)"
    echo "    => du kien: COLUMN_MISMATCH:temperature"
    ;;
  payload)
    # Sửa số trong JSON gốc, KHÔNG tính lại payload_hash.
    OLD_TEMP=$(psql_q "select temperature from telemetry_records where id = '$TARGET';")
    psql_x "update telemetry_records
            set raw_payload = replace(raw_payload, '\"temperature\":$OLD_TEMP', '\"temperature\":$FAKE_TEMP')
            where id = '$TARGET';"
    echo "    da sua raw_payload: temperature $OLD_TEMP -> $FAKE_TEMP (payload_hash giu nguyen)"
    echo "    => du kien: PAYLOAD_HASH_MISMATCH + COLUMN_MISMATCH"
    ;;
  full)
    # Kẻ tấn công sửa raw_payload, cột, VÀ tính lại payload_hash bằng SHA256 (công khai).
    OLD_TEMP=$(psql_q "select temperature from telemetry_records where id = '$TARGET';")
    psql_x "update telemetry_records
            set raw_payload = replace(raw_payload, '\"temperature\":$OLD_TEMP', '\"temperature\":$FAKE_TEMP'),
                temperature = $FAKE_TEMP
            where id = '$TARGET';"
    NEW_PAYLOAD=$(psql_q "select raw_payload from telemetry_records where id = '$TARGET';")
    NEW_HASH=$(printf '%s' "$NEW_PAYLOAD" | openssl dgst -sha256 -hex | awk '{print $NF}')
    psql_x "update telemetry_records set payload_hash = '$NEW_HASH' where id = '$TARGET';"
    echo "    da sua raw_payload + cot + tinh lai payload_hash = ${NEW_HASH:0:24}..."
    echo "    => du kien: RECORD_HASH_MISMATCH + CANONICAL_MISMATCH + SIGNATURE_INVALID"
    echo "       (record_hash can khoa HMAC ngoai DB; chu ky can private key trong ESP32)"
    ;;
  delete)
    psql_x "delete from telemetry_records where id = '$TARGET';"
    echo "    da XOA ban ghi $TARGET khoi chuoi"
    echo "    => du kien: CHAIN_BROKEN o ban ghi ke tiep (previous_hash tro vao khoang trong)"
    ;;
  *)
    echo "MODE khong hop le: $MODE (column | payload | full | delete | restore)"; exit 1 ;;
esac

if [ "$MODE" != "delete" ]; then
  echo "[4] Sau khi sua:"
  show_record "$TARGET"
fi

check_integrity

echo
echo "Mo $BASE_URL/ -> tab Toan ven (va tab Giam sat, ban ghi bi to do)."
echo "Khoi phuc lai: MODE=restore SHIPMENT=$SHIPMENT ./scripts/tamper-demo.sh"
