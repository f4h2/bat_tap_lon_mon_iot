package com.example.coldchain.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.security")
public record SecurityProperties(
        String apiKeyPepper,
        long timestampSkewSeconds,
        String defaultSignatureAlgorithm,
        // Khóa bí mật để HMAC record_hash & anchor — PHẢI đặt ngoài DB (env/KMS).
        String integritySecret
) {
}
