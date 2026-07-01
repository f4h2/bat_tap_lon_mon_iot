package com.example.coldchain.controller;

import com.example.coldchain.dto.DeviceBindResponse;
import com.example.coldchain.dto.DeviceVerifyRequest;
import com.example.coldchain.dto.DeviceVerifyResponse;
import com.example.coldchain.service.DeviceBindService;
import com.example.coldchain.service.DeviceProvisioningService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/devices")
public class DeviceController {
    private final DeviceProvisioningService provisioningService;
    private final DeviceBindService bindService;

    public DeviceController(DeviceProvisioningService provisioningService, DeviceBindService bindService) {
        this.provisioningService = provisioningService;
        this.bindService = bindService;
    }

    // PHA 1 — kích hoạt thiết bị.
    @PostMapping("/verify")
    public ResponseEntity<DeviceVerifyResponse> verify(@Valid @RequestBody DeviceVerifyRequest request) {
        return ResponseEntity.ok(provisioningService.verify(request));
    }

    // PHA 2 (device-driven) — thiết bị tự gắn đơn ship (xác thực api_key + chữ ký, như telemetry).
    @PostMapping("/bind")
    public ResponseEntity<DeviceBindResponse> bind(
            @RequestHeader(value = "X-Device-Id", required = false) String deviceId,
            @RequestHeader(value = "X-Api-Key", required = false) String apiKey,
            @RequestHeader(value = "X-Timestamp", required = false) Long timestamp,
            @RequestHeader(value = "X-Nonce", required = false) String nonce,
            @RequestHeader(value = "X-Signature", required = false) String signature,
            @RequestBody String rawPayload
    ) {
        return ResponseEntity.ok(bindService.bind(deviceId, apiKey, timestamp, nonce, signature, rawPayload));
    }
}
