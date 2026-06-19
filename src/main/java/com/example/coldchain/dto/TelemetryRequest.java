package com.example.coldchain.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;

public record TelemetryRequest(
        @JsonProperty("shipment_code")
        @NotBlank
        @Size(max = 64)
        String shipmentCode,

        @DecimalMin(value = "-100.0")
        @DecimalMax(value = "100.0")
        BigDecimal temperature,

        @DecimalMin(value = "0.0")
        @DecimalMax(value = "100.0")
        BigDecimal humidity,

        @Min(-150)
        @Max(0)
        Integer rssi,

        @DecimalMin(value = "-90.0")
        @DecimalMax(value = "90.0")
        BigDecimal lat,

        @DecimalMin(value = "-180.0")
        @DecimalMax(value = "180.0")
        BigDecimal lng,

        @Min(0)
        @Max(100)
        Integer battery
) {
}
