-- Snapshot khóa ký (public key + thuật toán) vào TỪNG bản ghi telemetry.
-- Lý do: mỗi lần thiết bị reset & kích hoạt lại sẽ sinh cặp khóa MỚI và ghi đè
-- devices.public_key_pem. Nếu verify chữ ký của bản ghi cũ bằng khóa hiện tại,
-- toàn bộ dữ liệu của các chuyến hàng cũ sẽ bị báo "bị sửa đổi" oan.
-- Lưu khóa tại thời điểm ghi -> luôn verify đúng bằng khóa đã ký bản ghi đó.

ALTER TABLE telemetry_records ADD COLUMN public_key_pem text;
ALTER TABLE telemetry_records ADD COLUMN signature_algorithm varchar(64);

-- Backfill: các bản ghi hiện có được ký bằng khóa hiện tại của thiết bị
-- (giả định thiết bị chưa re-activate trước migration này).
UPDATE telemetry_records t
SET public_key_pem = d.public_key_pem,
    signature_algorithm = d.signature_algorithm
FROM devices d
WHERE t.device_id = d.device_id
  AND t.public_key_pem IS NULL;
