package com.example.coldchain.dto.admin;

/** Một đơn ship mà thiết bị đã từng gắn / gửi dữ liệu, kèm trạng thái và có phải đơn hiện tại không. */
public record ServedShipment(
        String shipmentCode,
        String itemType,
        String status,
        boolean current,
        long telemetryCount
) {
}
