package com.example.coldchain.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DeviceVerifyRequest(
        @JsonProperty("device_id")
        @NotBlank
        @Size(max = 128)
        String deviceId,

        @JsonProperty("verify_code")
        @NotBlank
        @Size(max = 128)
        String verifyCode,

        @JsonProperty("public_key")
        @NotBlank
        String publicKeyPem,

        @JsonProperty("signature_algorithm")
        @Size(max = 64)
        String signatureAlgorithm
) {
}
