package com.example.coldchain.dto.admin;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record GenerateVerifyCodeRequest(
        @NotBlank
        @Size(max = 64)
        String shipmentCode,

        @Min(1)
        Integer expiresInDays
) {
}
