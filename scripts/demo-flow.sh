#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
DEVICE_ID="${DEVICE_ID:-ESP32-A1B2C3D4}"
VERIFY_CODE="${VERIFY_CODE:-SHIP-123-8K2P}"
TMP_DIR="$(dirname "$0")/tmp"
mkdir -p "$TMP_DIR"

PRIVATE_KEY="$TMP_DIR/device_private.pem"
PUBLIC_KEY="$TMP_DIR/device_public.pem"
PROVISION_RESPONSE="$TMP_DIR/provision_response.json"

if [ ! -f "$PRIVATE_KEY" ]; then
  openssl ecparam -name prime256v1 -genkey -noout -out "$PRIVATE_KEY"
  openssl ec -in "$PRIVATE_KEY" -pubout -out "$PUBLIC_KEY" >/dev/null 2>&1
fi

PUBLIC_KEY_JSON=$(python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1]).read()))' "$PUBLIC_KEY")

cat > "$TMP_DIR/provision_body.json" <<JSON
{
  "device_id": "$DEVICE_ID",
  "verify_code": "$VERIFY_CODE",
  "public_key": $PUBLIC_KEY_JSON
}
JSON

echo "[1/4] Provision device"
curl -sS -X POST "$BASE_URL/api/devices/verify" \
  -H 'Content-Type: application/json' \
  --data-binary "@$TMP_DIR/provision_body.json" | tee "$PROVISION_RESPONSE"

echo
API_KEY=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["api_key"])' "$PROVISION_RESPONSE")

PAYLOAD='{"shipment_code":"SHIP-123","temperature":-17.2,"humidity":62.3,"rssi":-67,"lat":21.028511,"lng":105.804817,"battery":87}'
TIMESTAMP=$(date +%s)
NONCE=$(python3 -c 'import secrets; print(secrets.token_hex(12))')
PAYLOAD_HASH=$(python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.argv[1].encode("utf-8")).hexdigest())' "$PAYLOAD")
CANONICAL=$(printf "POST\n/api/telemetry\n%s\n%s\n%s\n%s" "$DEVICE_ID" "$TIMESTAMP" "$NONCE" "$PAYLOAD_HASH")
SIGNATURE=$(printf "%s" "$CANONICAL" | openssl dgst -sha256 -sign "$PRIVATE_KEY" | openssl base64 -A)

echo "[2/4] Send signed telemetry"
curl -sS -X POST "$BASE_URL/api/telemetry" \
  -H 'Content-Type: application/json' \
  -H "X-Device-Id: $DEVICE_ID" \
  -H "X-Api-Key: $API_KEY" \
  -H "X-Timestamp: $TIMESTAMP" \
  -H "X-Nonce: $NONCE" \
  -H "X-Signature: $SIGNATURE" \
  --data-binary "$PAYLOAD"

echo

echo "[3/4] Query telemetry history"
curl -sS "$BASE_URL/api/shipments/SHIP-123/telemetry"

echo

echo "[4/4] Query alerts"
curl -sS "$BASE_URL/api/shipments/SHIP-123/alerts"

echo
