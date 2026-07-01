package com.example.coldchain.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body của POST /api/devices/bind (thiết bị đã xác thực bằng api_key + chữ ký). */
public record DeviceBindPayload(
        @JsonProperty("shipment_code")
        @NotBlank
        @Size(max = 64)
        String shipmentCode
) {
}
