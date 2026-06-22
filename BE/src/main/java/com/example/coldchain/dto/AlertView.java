package com.example.coldchain.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.UUID;

public record AlertView(
        UUID id,
        @JsonProperty("shipment_code") String shipmentCode,
        @JsonProperty("device_id") String deviceId,
        String type,
        String level,
        String message,
        @JsonProperty("created_at") Instant createdAt
) {
}
