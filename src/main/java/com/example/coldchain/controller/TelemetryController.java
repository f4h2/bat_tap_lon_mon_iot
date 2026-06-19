package com.example.coldchain.controller;

import com.example.coldchain.dto.TelemetryResponse;
import com.example.coldchain.service.TelemetryIngestionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class TelemetryController {
    private final TelemetryIngestionService ingestionService;

    public TelemetryController(TelemetryIngestionService ingestionService) {
        this.ingestionService = ingestionService;
    }

    @PostMapping("/telemetry")
    public ResponseEntity<TelemetryResponse> receiveTelemetry(
            @RequestHeader(value = "X-Device-Id", required = false) String deviceId,
            @RequestHeader(value = "X-Api-Key", required = false) String apiKey,
            @RequestHeader(value = "X-Timestamp", required = false) Long timestamp,
            @RequestHeader(value = "X-Nonce", required = false) String nonce,
            @RequestHeader(value = "X-Signature", required = false) String signature,
            @RequestBody String rawPayload
    ) {
        return ResponseEntity.ok(ingestionService.ingest(deviceId, apiKey, timestamp, nonce, signature, rawPayload));
    }
}
