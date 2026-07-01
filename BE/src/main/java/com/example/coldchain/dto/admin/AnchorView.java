package com.example.coldchain.dto.admin;

import java.time.Instant;
import java.util.UUID;

public record AnchorView(
        UUID id,
        String headHash,
        long recordCount,
        Instant createdAt,
        boolean valid,
        String note
) {
}
