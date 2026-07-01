package com.example.coldchain.service;

import com.example.coldchain.config.SecurityProperties;
import com.example.coldchain.dto.DeviceBindPayload;
import com.example.coldchain.dto.DeviceBindResponse;
import com.example.coldchain.entity.Device;
import com.example.coldchain.entity.DeviceNonce;
import com.example.coldchain.entity.Shipment;
import com.example.coldchain.entity.enums.DeviceStatus;
import com.example.coldchain.entity.enums.ShipmentStatus;
import com.example.coldchain.exception.ApiException;
import com.example.coldchain.repository.DeviceNonceRepository;
import com.example.coldchain.repository.DeviceRepository;
import com.example.coldchain.repository.ShipmentRepository;
import com.example.coldchain.util.ApiKeyUtil;
import com.example.coldchain.util.HashUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Set;

/**
 * PHA 2 (device-driven) — Thiết bị đã kích hoạt tự gắn mình vào 1 đơn ship.
 * Xác thực giống telemetry: api_key + timestamp/nonce chống replay + chữ ký ECDSA.
 * Lặp lại được: mỗi lần bind sẽ đổi đơn ship hiện tại của thiết bị.
 */
@Service
public class DeviceBindService {
    private static final String BIND_PATH = "/api/devices/bind";

    private final DeviceRepository deviceRepository;
    private final ShipmentRepository shipmentRepository;
    private final DeviceNonceRepository nonceRepository;
    private final SignatureService signatureService;
    private final AuditService auditService;
    private final SecurityProperties securityProperties;
    private final ObjectMapper objectMapper;
    private final Validator validator;

    public DeviceBindService(DeviceRepository deviceRepository,
                             ShipmentRepository shipmentRepository,
                             DeviceNonceRepository nonceRepository,
                             SignatureService signatureService,
                             AuditService auditService,
                             SecurityProperties securityProperties,
                             ObjectMapper objectMapper,
                             Validator validator) {
        this.deviceRepository = deviceRepository;
        this.shipmentRepository = shipmentRepository;
        this.nonceRepository = nonceRepository;
        this.signatureService = signatureService;
        this.auditService = auditService;
        this.securityProperties = securityProperties;
        this.objectMapper = objectMapper;
        this.validator = validator;
    }

    @Transactional
    public DeviceBindResponse bind(String deviceId, String apiKey, Long timestamp,
                                   String nonce, String signature, String rawPayload) {
        Device device = deviceRepository.findById(required(deviceId, "X-Device-Id"))
                .orElseThrow(() -> ApiException.unauthorized("DEVICE_NOT_FOUND", "Unknown device"));
        if (device.getStatus() != DeviceStatus.ACTIVE) {
            auditService.fail("DEVICE", deviceId, "DEVICE_BIND", "Device is not active");
            throw ApiException.forbidden("DEVICE_NOT_ACTIVE", "Device is not active");
        }

        verifyApiKey(device, required(apiKey, "X-Api-Key"));
        verifyTimestamp(timestamp);
        String cleanNonce = required(nonce, "X-Nonce");
        String cleanSignature = required(signature, "X-Signature");

        DeviceBindPayload payload = parseAndValidate(rawPayload);
        Shipment shipment = shipmentRepository.findById(payload.shipmentCode().trim())
                .orElseThrow(() -> ApiException.badRequest("SHIPMENT_NOT_FOUND", "Shipment does not exist"));
        if (shipment.getStatus() != ShipmentStatus.ACTIVE) {
            throw ApiException.badRequest("SHIPMENT_NOT_ACTIVE", "Shipment is " + shipment.getStatus());
        }

        String payloadHash = HashUtil.sha256Hex(rawPayload);
        String canonicalRequest = "POST\n" + BIND_PATH + "\n" + deviceId + "\n" + timestamp + "\n" + cleanNonce + "\n" + payloadHash;
        if (!signatureService.verify(device.getPublicKeyPem(), device.getSignatureAlgorithm(), canonicalRequest, cleanSignature)) {
            auditService.fail("DEVICE", deviceId, "DEVICE_BIND", "Invalid signature");
            throw ApiException.unauthorized("SIGNATURE_INVALID", "Signature verification failed");
        }

        saveNonceOnce(deviceId, timestamp, cleanNonce);

        device.setShipmentCode(shipment.getShipmentCode());
        device.setLastSeenAt(Instant.now());
        auditService.success("DEVICE", deviceId, "DEVICE_BIND", "Bound to shipment " + shipment.getShipmentCode());
        return new DeviceBindResponse(deviceId, shipment.getShipmentCode(), device.getStatus().name());
    }

    private void verifyApiKey(Device device, String apiKey) {
        String requestHash = ApiKeyUtil.hmacSha256Hex(apiKey, securityProperties.apiKeyPepper());
        if (!ApiKeyUtil.constantTimeEquals(requestHash, device.getApiKeyHash())) {
            auditService.fail("DEVICE", device.getDeviceId(), "DEVICE_BIND", "Invalid API key");
            throw ApiException.unauthorized("API_KEY_INVALID", "Invalid API key");
        }
    }

    private void verifyTimestamp(Long timestamp) {
        if (timestamp == null) {
            throw ApiException.badRequest("TIMESTAMP_REQUIRED", "Missing X-Timestamp");
        }
        long diff = Math.abs(Instant.now().getEpochSecond() - timestamp);
        if (diff > securityProperties.timestampSkewSeconds()) {
            throw ApiException.unauthorized("TIMESTAMP_EXPIRED", "Timestamp is outside allowed window");
        }
    }

    private void saveNonceOnce(String deviceId, Long timestamp, String nonce) {
        if (nonceRepository.existsByDeviceIdAndNonce(deviceId, nonce)) {
            throw ApiException.unauthorized("REPLAY_DETECTED", "Nonce was already used");
        }
        DeviceNonce deviceNonce = new DeviceNonce();
        deviceNonce.setDeviceId(deviceId);
        deviceNonce.setDeviceTimestamp(timestamp);
        deviceNonce.setNonce(nonce);
        try {
            nonceRepository.saveAndFlush(deviceNonce);
        } catch (DataIntegrityViolationException ex) {
            throw ApiException.unauthorized("REPLAY_DETECTED", "Nonce was already used");
        }
    }

    private DeviceBindPayload parseAndValidate(String rawPayload) {
        try {
            DeviceBindPayload payload = objectMapper.readValue(rawPayload, DeviceBindPayload.class);
            Set<ConstraintViolation<DeviceBindPayload>> violations = validator.validate(payload);
            if (!violations.isEmpty()) {
                throw ApiException.badRequest("PAYLOAD_INVALID", "shipment_code is required");
            }
            return payload;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw ApiException.badRequest("JSON_INVALID", "Bind payload must be valid JSON");
        }
    }

    private String required(String value, String name) {
        if (value == null || value.isBlank()) {
            throw ApiException.badRequest("HEADER_REQUIRED", "Missing " + name);
        }
        return value.trim();
    }
}
