package com.example.coldchain.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.UUID;

public record TelemetryResponse(
        String status,
        @JsonProperty("telemetry_id") UUID telemetryId,
        @JsonProperty("record_hash") String recordHash,
        @JsonProperty("alerts_created") int alertsCreated,
        List<String> alerts
) {
}
