package com.example.coldchain.controller;

import com.example.coldchain.dto.admin.CreateShipmentRequest;
import com.example.coldchain.dto.admin.DashboardStatsResponse;
import com.example.coldchain.dto.admin.DeviceAdminResponse;
import com.example.coldchain.dto.admin.GenerateVerifyCodeRequest;
import com.example.coldchain.entity.Shipment;
import com.example.coldchain.entity.VerifyCode;
import com.example.coldchain.service.AdminService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/devices")
    public ResponseEntity<List<DeviceAdminResponse>> getDevices() {
        return ResponseEntity.ok(adminService.getDevices());
    }

    @GetMapping("/shipments")
    public ResponseEntity<List<Shipment>> getShipments() {
        return ResponseEntity.ok(adminService.getShipments());
    }

    @PostMapping("/shipments")
    public ResponseEntity<Shipment> createShipment(@Valid @RequestBody CreateShipmentRequest request) {
        return ResponseEntity.ok(adminService.createShipment(request));
    }

    @GetMapping("/verify-codes")
    public ResponseEntity<List<VerifyCode>> getVerifyCodes() {
        return ResponseEntity.ok(adminService.getVerifyCodes());
    }

    @PostMapping("/devices/generate-code")
    public ResponseEntity<VerifyCode> generateVerifyCode(@Valid @RequestBody GenerateVerifyCodeRequest request) {
        return ResponseEntity.ok(adminService.generateVerifyCode(request));
    }

    @GetMapping("/dashboard/stats")
    public ResponseEntity<DashboardStatsResponse> getDashboardStats() {
        return ResponseEntity.ok(adminService.getDashboardStats());
    }
}
