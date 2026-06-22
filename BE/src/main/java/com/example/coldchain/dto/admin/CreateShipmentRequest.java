package com.example.coldchain.dto.admin;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record CreateShipmentRequest(
        @NotBlank
        @Size(max = 64)
        String shipmentCode,

        @NotBlank
        @Size(max = 255)
        String itemType,

        @DecimalMin(value = "-100.0")
        @DecimalMax(value = "100.0")
        BigDecimal minTemperature,

        @DecimalMin(value = "-100.0")
        @DecimalMax(value = "100.0")
        BigDecimal maxTemperature,

        @DecimalMin(value = "0.0")
        @DecimalMax(value = "100.0")
        BigDecimal minHumidity,

        @DecimalMin(value = "0.0")
        @DecimalMax(value = "100.0")
        BigDecimal maxHumidity
) {
}
