package com.example.coldchain.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record DeviceResetResponse(
        @JsonProperty("device_id") String deviceId,
        String status
) {
}
