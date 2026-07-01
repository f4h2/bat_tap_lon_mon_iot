-- Tách "kích hoạt thiết bị" khỏi "gắn đơn ship".
-- Thiết bị có thể ACTIVE mà chưa gắn đơn ship nào; verify_codes trở thành MÃ KÍCH HOẠT
-- (không thuộc shipment). Việc gắn đơn ship dùng chính shipment_code (QR) + API bind.

alter table devices alter column shipment_code drop not null;
alter table verify_codes alter column shipment_code drop not null;
