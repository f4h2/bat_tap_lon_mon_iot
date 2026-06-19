package com.example.coldchain.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record DeviceVerifyResponse(
        @JsonProperty("device_id") String deviceId,
        @JsonProperty("api_key") String apiKey,
        String status,
        @JsonProperty("shipment_code") String shipmentCode
) {
}
