package com.example.coldchain.service;

import com.example.coldchain.dto.admin.AdminBindRequest;
import com.example.coldchain.dto.admin.CreateShipmentRequest;
import com.example.coldchain.dto.admin.DashboardStatsResponse;
import com.example.coldchain.dto.admin.DeviceAdminResponse;
import com.example.coldchain.dto.admin.GenerateActivationCodeRequest;
import com.example.coldchain.entity.Device;
import com.example.coldchain.entity.Shipment;
import com.example.coldchain.entity.VerifyCode;
import com.example.coldchain.entity.enums.DeviceStatus;
import com.example.coldchain.entity.enums.ShipmentStatus;
import com.example.coldchain.entity.enums.VerifyCodeStatus;
import com.example.coldchain.exception.ApiException;
import com.example.coldchain.repository.AlertRepository;
import com.example.coldchain.repository.DeviceRepository;
import com.example.coldchain.repository.ShipmentRepository;
import com.example.coldchain.repository.VerifyCodeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

@Service
public class AdminService {
    private final DeviceRepository deviceRepository;
    private final ShipmentRepository shipmentRepository;
    private final VerifyCodeRepository verifyCodeRepository;
    private final AlertRepository alertRepository;
    private final com.example.coldchain.repository.TelemetryRecordRepository telemetryRepository;

    public AdminService(DeviceRepository deviceRepository,
                        ShipmentRepository shipmentRepository,
                        VerifyCodeRepository verifyCodeRepository,
                        AlertRepository alertRepository,
                        com.example.coldchain.repository.TelemetryRecordRepository telemetryRepository) {
        this.deviceRepository = deviceRepository;
        this.shipmentRepository = shipmentRepository;
        this.verifyCodeRepository = verifyCodeRepository;
        this.alertRepository = alertRepository;
        this.telemetryRepository = telemetryRepository;
    }

    public com.example.coldchain.dto.admin.DeviceDetailResponse getDeviceDetail(String deviceId) {
        Device d = deviceRepository.findById(deviceId)
                .orElseThrow(() -> ApiException.badRequest("DEVICE_NOT_FOUND", "Device not found"));
        java.util.List<com.example.coldchain.dto.admin.ServedShipment> served = new java.util.ArrayList<>();
        for (String sc : telemetryRepository.findDistinctShipmentCodesByDeviceId(deviceId)) {
            Shipment sh = shipmentRepository.findById(sc).orElse(null);
            long cnt = telemetryRepository.countByDeviceIdAndShipmentCode(deviceId, sc);
            served.add(new com.example.coldchain.dto.admin.ServedShipment(sc,
                    sh != null ? sh.getItemType() : "—",
                    sh != null ? sh.getStatus().name() : "UNKNOWN",
                    sc.equals(d.getShipmentCode()), cnt));
        }
        // Đơn đang gắn hiện tại nhưng chưa gửi telemetry -> vẫn đưa vào danh sách.
        if (d.getShipmentCode() != null && served.stream().noneMatch(s -> s.shipmentCode().equals(d.getShipmentCode()))) {
            Shipment sh = shipmentRepository.findById(d.getShipmentCode()).orElse(null);
            served.add(0, new com.example.coldchain.dto.admin.ServedShipment(d.getShipmentCode(),
                    sh != null ? sh.getItemType() : "—",
                    sh != null ? sh.getStatus().name() : "UNKNOWN", true, 0));
        }
        long telemetryCount = telemetryRepository.countByDeviceId(deviceId);
        return new com.example.coldchain.dto.admin.DeviceDetailResponse(
                d.getDeviceId(), d.getShipmentCode(), d.getSignatureAlgorithm(), d.getStatus(),
                d.getCreatedAt(), d.getActivatedAt(), d.getLastSeenAt(), served, telemetryCount);
    }

    // Map đơn ship -> danh sách device_id đã từng gửi dữ liệu (lịch sử gắn, kể cả đơn đã hoàn thành).
    public java.util.Map<String, java.util.List<String>> getShipmentDeviceMap() {
        java.util.Map<String, java.util.List<String>> map = new java.util.HashMap<>();
        for (Object[] pair : telemetryRepository.findDistinctShipmentDevicePairs()) {
            map.computeIfAbsent((String) pair[0], k -> new java.util.ArrayList<>()).add((String) pair[1]);
        }
        return map;
    }

    public Page<DeviceAdminResponse> getDevices(Pageable pageable) {
        return deviceRepository.findAll(pageable)
                .map(d -> new DeviceAdminResponse(
                        d.getDeviceId(),
                        d.getShipmentCode(),
                        d.getSignatureAlgorithm(),
                        d.getStatus(),
                        d.getCreatedAt(),
                        d.getActivatedAt(),
                        d.getLastSeenAt()
                ));
    }

    public Page<Shipment> getShipments(Pageable pageable) {
        return shipmentRepository.findAll(pageable);
    }

    public Page<VerifyCode> getVerifyCodes(Pageable pageable) {
        return verifyCodeRepository.findAllByOrderByCreatedAtDesc(pageable);
    }

    @Transactional
    public Shipment createShipment(CreateShipmentRequest request) {
        if (shipmentRepository.existsById(request.shipmentCode())) {
            throw ApiException.badRequest("SHIPMENT_EXISTS", "Shipment code already exists");
        }
        Shipment shipment = new Shipment();
        shipment.setShipmentCode(request.shipmentCode());
        shipment.setItemType(request.itemType());
        shipment.setMinTemperature(request.minTemperature());
        shipment.setMaxTemperature(request.maxTemperature());
        shipment.setMinHumidity(request.minHumidity());
        shipment.setMaxHumidity(request.maxHumidity());
        shipment.setStatus(ShipmentStatus.ACTIVE);
        return shipmentRepository.save(shipment);
    }

    @Transactional
    public Shipment updateShipmentStatus(String shipmentCode, com.example.coldchain.dto.admin.UpdateShipmentStatusRequest request) {
        Shipment shipment = shipmentRepository.findById(shipmentCode)
                .orElseThrow(() -> ApiException.badRequest("SHIPMENT_NOT_FOUND", "Shipment not found"));
        shipment.setStatus(request.status());
        return shipmentRepository.save(shipment);
    }

    // PHA 1 — sinh MÃ KÍCH HOẠT thiết bị (không thuộc đơn ship).
    @Transactional
    public VerifyCode generateActivationCode(GenerateActivationCodeRequest request) {
        String code = "ACT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        VerifyCode activation = new VerifyCode();
        activation.setVerifyCode(code);
        activation.setShipmentCode(null);
        activation.setStatus(VerifyCodeStatus.UNUSED);
        int days = request.expiresInDays() != null ? request.expiresInDays() : 30;
        activation.setExpiresAt(Instant.now().plus(days, ChronoUnit.DAYS));
        return verifyCodeRepository.save(activation);
    }

    // PHA 2 (admin-driven) — gán / bỏ gắn đơn ship cho thiết bị.
    @Transactional
    public Device bindDeviceShipment(String deviceId, AdminBindRequest request) {
        Device device = deviceRepository.findById(deviceId)
                .orElseThrow(() -> ApiException.badRequest("DEVICE_NOT_FOUND", "Device not found"));
        String sc = request.shipmentCode();
        if (sc == null || sc.isBlank()) {
            device.setShipmentCode(null); // bỏ gắn
        } else {
            Shipment shipment = shipmentRepository.findById(sc.trim())
                    .orElseThrow(() -> ApiException.badRequest("SHIPMENT_NOT_FOUND", "Shipment not found"));
            if (shipment.getStatus() != ShipmentStatus.ACTIVE) {
                throw ApiException.badRequest("SHIPMENT_NOT_ACTIVE", "Shipment is " + shipment.getStatus());
            }
            device.setShipmentCode(shipment.getShipmentCode());
        }
        return deviceRepository.save(device);
    }

    public DashboardStatsResponse getDashboardStats() {
        long totalShipments = shipmentRepository.count();
        long activeDevices = deviceRepository.countByStatus(DeviceStatus.ACTIVE);
        long unusedCodes = verifyCodeRepository.countByStatus(VerifyCodeStatus.UNUSED);
        long totalAlerts = alertRepository.count();

        return new DashboardStatsResponse(totalShipments, activeDevices, unusedCodes, totalAlerts);
    }
}
