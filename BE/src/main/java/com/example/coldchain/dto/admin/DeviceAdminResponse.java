package com.example.coldchain.dto.admin;

import com.example.coldchain.entity.enums.DeviceStatus;

import java.time.Instant;

public record DeviceAdminResponse(
        String deviceId,
        String shipmentCode,
        String signatureAlgorithm,
        DeviceStatus status,
        Instant createdAt,
        Instant activatedAt,
        Instant lastSeenAt
) {
}
