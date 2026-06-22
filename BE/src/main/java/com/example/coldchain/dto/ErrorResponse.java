package com.example.coldchain.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.Map;

public record ErrorResponse(
        String code,
        String message,
        @JsonProperty("created_at") Instant createdAt,
        Map<String, String> details
) {
    public static ErrorResponse of(String code, String message) {
        return new ErrorResponse(code, message, Instant.now(), Map.of());
    }

    public static ErrorResponse of(String code, String message, Map<String, String> details) {
        return new ErrorResponse(code, message, Instant.now(), details);
    }
}
