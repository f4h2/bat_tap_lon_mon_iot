package com.example.coldchain.service;

import com.example.coldchain.dto.admin.CreateShipmentRequest;
import com.example.coldchain.dto.admin.DashboardStatsResponse;
import com.example.coldchain.dto.admin.DeviceAdminResponse;
import com.example.coldchain.dto.admin.GenerateVerifyCodeRequest;
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
import java.util.stream.Collectors;

@Service
public class AdminService {
    private final DeviceRepository deviceRepository;
    private final ShipmentRepository shipmentRepository;
    private final VerifyCodeRepository verifyCodeRepository;
    private final AlertRepository alertRepository;

    public AdminService(DeviceRepository deviceRepository,
                        ShipmentRepository shipmentRepository,
                        VerifyCodeRepository verifyCodeRepository,
                        AlertRepository alertRepository) {
        this.deviceRepository = deviceRepository;
        this.shipmentRepository = shipmentRepository;
        this.verifyCodeRepository = verifyCodeRepository;
        this.alertRepository = alertRepository;
    }

    public List<DeviceAdminResponse> getDevices() {
        return deviceRepository.findAll().stream()
                .map(d -> new DeviceAdminResponse(
                        d.getDeviceId(),
                        d.getShipmentCode(),
                        d.getSignatureAlgorithm(),
                        d.getStatus(),
                        d.getCreatedAt(),
                        d.getActivatedAt(),
                        d.getLastSeenAt()
                ))
                .collect(Collectors.toList());
    }

    public List<Shipment> getShipments() {
        return shipmentRepository.findAll();
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
    public VerifyCode generateVerifyCode(GenerateVerifyCodeRequest request) {
        if (!shipmentRepository.existsById(request.shipmentCode())) {
            throw ApiException.badRequest("SHIPMENT_NOT_FOUND", "Shipment not found");
        }
        String code = request.shipmentCode() + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        VerifyCode verifyCode = new VerifyCode();
        verifyCode.setVerifyCode(code);
        verifyCode.setShipmentCode(request.shipmentCode());
        verifyCode.setStatus(VerifyCodeStatus.UNUSED);
        
        int days = request.expiresInDays() != null ? request.expiresInDays() : 7;
        verifyCode.setExpiresAt(Instant.now().plus(days, ChronoUnit.DAYS));
        
        return verifyCodeRepository.save(verifyCode);
    }

    public DashboardStatsResponse getDashboardStats() {
        long totalShipments = shipmentRepository.count();
        long activeDevices = deviceRepository.countByStatus(DeviceStatus.ACTIVE);
        long unusedCodes = verifyCodeRepository.countByStatus(VerifyCodeStatus.UNUSED);
        long totalAlerts = alertRepository.count();

        return new DashboardStatsResponse(totalShipments, activeDevices, unusedCodes, totalAlerts);
    }
}
