package com.example.coldchain.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record DeviceBindResponse(
        @JsonProperty("device_id") String deviceId,
        @JsonProperty("shipment_code") String shipmentCode,
        String status
) {
}
