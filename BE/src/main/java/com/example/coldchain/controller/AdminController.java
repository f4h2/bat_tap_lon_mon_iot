package com.example.coldchain.controller;

import com.example.coldchain.dto.admin.AdminBindRequest;
import com.example.coldchain.dto.admin.CreateShipmentRequest;
import com.example.coldchain.dto.admin.DashboardStatsResponse;
import com.example.coldchain.dto.admin.DeviceAdminResponse;
import com.example.coldchain.dto.admin.GenerateActivationCodeRequest;
import com.example.coldchain.dto.admin.UpdateShipmentStatusRequest;
import com.example.coldchain.entity.Device;
import com.example.coldchain.entity.Shipment;
import com.example.coldchain.entity.VerifyCode;
import com.example.coldchain.service.AdminService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
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
    public ResponseEntity<Page<DeviceAdminResponse>> getDevices(@RequestParam(defaultValue = "0") int page,
                                                                @RequestParam(defaultValue = "100") int size) {
        return ResponseEntity.ok(adminService.getDevices(PageRequest.of(page, size)));
    }

    @GetMapping("/devices/{deviceId}")
    public ResponseEntity<com.example.coldchain.dto.admin.DeviceDetailResponse> getDeviceDetail(@PathVariable String deviceId) {
        return ResponseEntity.ok(adminService.getDeviceDetail(deviceId));
    }

    @GetMapping("/shipments")
    public ResponseEntity<Page<Shipment>> getShipments(@RequestParam(defaultValue = "0") int page,
                                                       @RequestParam(defaultValue = "100") int size) {
        return ResponseEntity.ok(adminService.getShipments(PageRequest.of(page, size)));
    }

    @PostMapping("/shipments")
    public ResponseEntity<Shipment> createShipment(@Valid @RequestBody CreateShipmentRequest request) {
        return ResponseEntity.ok(adminService.createShipment(request));
    }

    @PutMapping("/shipments/{code}/status")
    public ResponseEntity<Shipment> updateShipmentStatus(@PathVariable String code, @Valid @RequestBody UpdateShipmentStatusRequest request) {
        return ResponseEntity.ok(adminService.updateShipmentStatus(code, request));
    }

    @GetMapping("/verify-codes")
    public ResponseEntity<Page<VerifyCode>> getVerifyCodes(@RequestParam(defaultValue = "0") int page,
                                                           @RequestParam(defaultValue = "100") int size) {
        return ResponseEntity.ok(adminService.getVerifyCodes(PageRequest.of(page, size)));
    }

    // PHA 1 — sinh mã kích hoạt thiết bị (không thuộc đơn ship).
    @PostMapping("/devices/generate-code")
    public ResponseEntity<VerifyCode> generateActivationCode(@Valid @RequestBody GenerateActivationCodeRequest request) {
        return ResponseEntity.ok(adminService.generateActivationCode(request));
    }

    // PHA 2 (admin-driven) — gán/bỏ gắn đơn ship cho thiết bị (body rỗng shipment_code = bỏ gắn).
    @PutMapping("/devices/{deviceId}/shipment")
    public ResponseEntity<Device> bindDeviceShipment(@PathVariable String deviceId,
                                                     @Valid @RequestBody AdminBindRequest request) {
        return ResponseEntity.ok(adminService.bindDeviceShipment(deviceId, request));
    }

    @GetMapping("/dashboard/stats")
    public ResponseEntity<DashboardStatsResponse> getDashboardStats() {
        return ResponseEntity.ok(adminService.getDashboardStats());
    }
}
