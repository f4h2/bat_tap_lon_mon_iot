package com.example.coldchain.dto.admin;

import com.example.coldchain.entity.enums.DeviceStatus;

import java.time.Instant;
import java.util.List;

public record DeviceDetailResponse(
        String deviceId,
        String shipmentCode,
        String signatureAlgorithm,
        DeviceStatus status,
        Instant createdAt,
        Instant activatedAt,
        Instant lastSeenAt,
        List<ServedShipment> shipmentsServed,   // các đơn ship thiết bị đã từng gắn/gửi dữ liệu
        long telemetryCount
) {
}
