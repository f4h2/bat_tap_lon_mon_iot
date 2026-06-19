package com.example.coldchain.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record TelemetryView(
        UUID id,
        @JsonProperty("device_id") String deviceId,
        @JsonProperty("shipment_code") String shipmentCode,
        BigDecimal temperature,
        BigDecimal humidity,
        Integer rssi,
        BigDecimal lat,
        BigDecimal lng,
        Integer battery,
        @JsonProperty("device_timestamp") Long deviceTimestamp,
        @JsonProperty("payload_hash") String payloadHash,
        @JsonProperty("record_hash") String recordHash,
        @JsonProperty("created_at") Instant createdAt
) {
}
