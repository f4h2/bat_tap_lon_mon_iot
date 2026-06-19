package com.example.coldchain.controller;

import com.example.coldchain.dto.DeviceVerifyRequest;
import com.example.coldchain.dto.DeviceVerifyResponse;
import com.example.coldchain.service.DeviceProvisioningService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/devices")
public class DeviceController {
    private final DeviceProvisioningService provisioningService;

    public DeviceController(DeviceProvisioningService provisioningService) {
        this.provisioningService = provisioningService;
    }

    @PostMapping("/verify")
    public ResponseEntity<DeviceVerifyResponse> verify(@Valid @RequestBody DeviceVerifyRequest request) {
        return ResponseEntity.ok(provisioningService.verify(request));
    }
}
