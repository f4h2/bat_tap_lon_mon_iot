package com.example.coldchain.dto.admin;

import com.example.coldchain.entity.enums.ShipmentStatus;
import jakarta.validation.constraints.NotNull;

public record UpdateShipmentStatusRequest(
        @NotNull(message = "Status is required")
        ShipmentStatus status
) {
}
