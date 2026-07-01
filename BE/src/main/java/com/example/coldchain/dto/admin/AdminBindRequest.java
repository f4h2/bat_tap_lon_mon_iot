package com.example.coldchain.dto.admin;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Size;

/** Admin gán/bỏ gắn đơn ship cho thiết bị. shipmentCode null/rỗng = bỏ gắn. */
public record AdminBindRequest(
        @JsonProperty("shipment_code")
        @Size(max = 64)
        String shipmentCode
) {
}
