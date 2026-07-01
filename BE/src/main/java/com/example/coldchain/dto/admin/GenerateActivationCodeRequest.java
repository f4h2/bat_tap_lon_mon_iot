package com.example.coldchain.dto.admin;

import jakarta.validation.constraints.Min;

public record GenerateActivationCodeRequest(
        @Min(1)
        Integer expiresInDays
) {
}
