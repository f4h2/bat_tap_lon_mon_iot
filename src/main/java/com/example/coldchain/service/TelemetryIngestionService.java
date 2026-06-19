package com.example.coldchain.service;

import com.example.coldchain.config.SecurityProperties;
import com.example.coldchain.dto.TelemetryRequest;
import com.example.coldchain.dto.TelemetryResponse;
import com.example.coldchain.entity.*;
import com.example.coldchain.entity.enums.DeviceStatus;
import com.example.coldchain.exception.ApiException;
import com.example.coldchain.repository.*;
import com.example.coldchain.util.ApiKeyUtil;
import com.example.coldchain.util.HashUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Set;

@Service
public class TelemetryIngestionService {
    private static final String TELEMETRY_PATH = "/api/telemetry";

    private final DeviceRepository deviceRepository;
    private final ShipmentRepository shipmentRepository;
    private final TelemetryRecordRepository telemetryRepository;
    private final DeviceNonceRepository nonceRepository;
    private final SignatureService signatureService;
    private final AlertService alertService;
    private final AuditService auditService;
    private final SecurityProperties securityProperties;
    private final ObjectMapper objectMapper;
    private final Validator validator;

    public TelemetryIngestionService(DeviceRepository deviceRepository,
                                     ShipmentRepository shipmentRepository,
                                     TelemetryRecordRepository telemetryRepository,
                                     DeviceNonceRepository nonceRepository,
                                     SignatureService signatureService,
                                     AlertService alertService,
                                     AuditService auditService,
                                     SecurityProperties securityProperties,
                                     ObjectMapper objectMapper,
                                     Validator validator) {
        this.deviceRepository = deviceRepository;
        this.shipmentRepository = shipmentRepository;
        this.telemetryRepository = telemetryRepository;
        this.nonceRepository = nonceRepository;
        this.signatureService = signatureService;
        this.alertService = alertService;
        this.auditService = auditService;
        this.securityProperties = securityProperties;
        this.objectMapper = objectMapper;
        this.validator = validator;
    }

    @Transactional
    public TelemetryResponse ingest(String deviceId,
                                    String apiKey,
                                    Long timestamp,
                                    String nonce,
                                    String signature,
                                    String rawPayload) {
        Device device = deviceRepository.findById(required(deviceId, "X-Device-Id"))
                .orElseThrow(() -> ApiException.unauthorized("DEVICE_NOT_FOUND", "Unknown device"));

        if (device.getStatus() != DeviceStatus.ACTIVE) {
            auditService.fail("DEVICE", deviceId, "TELEMETRY", "Device is not active");
            throw ApiException.forbidden("DEVICE_NOT_ACTIVE", "Device is not active");
        }

        verifyApiKey(device, required(apiKey, "X-Api-Key"));
        verifyTimestamp(timestamp);
        String cleanNonce = required(nonce, "X-Nonce");
        String cleanSignature = required(signature, "X-Signature");

        TelemetryRequest payload = parseAndValidate(rawPayload);
        if (!device.getShipmentCode().equals(payload.shipmentCode())) {
            auditService.fail("DEVICE", deviceId, "TELEMETRY", "Shipment mismatch");
            throw ApiException.forbidden("SHIPMENT_MISMATCH", "Device is not assigned to this shipment");
        }

        Shipment shipment = shipmentRepository.findById(payload.shipmentCode())
                .orElseThrow(() -> ApiException.badRequest("SHIPMENT_NOT_FOUND", "Shipment does not exist"));

        String payloadHash = HashUtil.sha256Hex(rawPayload);
        String canonicalRequest = canonicalRequest(deviceId, timestamp, cleanNonce, payloadHash);
        if (!signatureService.verify(device.getPublicKeyPem(), device.getSignatureAlgorithm(), canonicalRequest, cleanSignature)) {
            auditService.fail("DEVICE", deviceId, "TELEMETRY", "Invalid signature");
            throw ApiException.unauthorized("SIGNATURE_INVALID", "Signature verification failed");
        }

        saveNonceOnce(deviceId, timestamp, cleanNonce);

        String previousHash = telemetryRepository.findTopByDeviceIdOrderByCreatedAtDesc(deviceId)
                .map(TelemetryRecord::getRecordHash)
                .orElse("GENESIS");
        String recordHash = HashUtil.sha256Hex(deviceId + "|" + timestamp + "|" + payloadHash + "|" + cleanSignature + "|" + previousHash);

        TelemetryRecord telemetry = new TelemetryRecord();
        telemetry.setDeviceId(deviceId);
        telemetry.setShipmentCode(payload.shipmentCode());
        telemetry.setTemperature(payload.temperature());
        telemetry.setHumidity(payload.humidity());
        telemetry.setRssi(payload.rssi());
        telemetry.setLat(payload.lat());
        telemetry.setLng(payload.lng());
        telemetry.setBattery(payload.battery());
        telemetry.setRawPayload(rawPayload);
        telemetry.setSignature(cleanSignature);
        telemetry.setPayloadHash(payloadHash);
        telemetry.setPreviousHash(previousHash);
        telemetry.setRecordHash(recordHash);
        telemetry.setCanonicalRequest(canonicalRequest);
        telemetry.setDeviceTimestamp(timestamp);
        telemetry.setNonce(cleanNonce);
        telemetry = telemetryRepository.saveAndFlush(telemetry);

        device.setLastSeenAt(Instant.now());
        List<Alert> alerts = alertService.evaluateAndSave(shipment, telemetry);
        auditService.success("DEVICE", deviceId, "TELEMETRY", "Telemetry accepted");
        List<String> alertMessages = alerts.stream().map(Alert::getMessage).toList();
        return new TelemetryResponse("OK", telemetry.getId(), recordHash, alerts.size(), alertMessages);
    }

    private void verifyApiKey(Device device, String apiKey) {
        String requestHash = ApiKeyUtil.hmacSha256Hex(apiKey, securityProperties.apiKeyPepper());
        if (!ApiKeyUtil.constantTimeEquals(requestHash, device.getApiKeyHash())) {
            auditService.fail("DEVICE", device.getDeviceId(), "TELEMETRY", "Invalid API key");
            throw ApiException.unauthorized("API_KEY_INVALID", "Invalid API key");
        }
    }

    private void verifyTimestamp(Long timestamp) {
        if (timestamp == null) {
            throw ApiException.badRequest("TIMESTAMP_REQUIRED", "Missing X-Timestamp");
        }
        long now = Instant.now().getEpochSecond();
        long diff = Math.abs(now - timestamp);
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

    private TelemetryRequest parseAndValidate(String rawPayload) {
        try {
            TelemetryRequest payload = objectMapper.readValue(rawPayload, TelemetryRequest.class);
            Set<ConstraintViolation<TelemetryRequest>> violations = validator.validate(payload);
            if (!violations.isEmpty()) {
                String message = violations.stream().findFirst().map(v -> v.getPropertyPath() + " " + v.getMessage()).orElse("Invalid telemetry payload");
                throw ApiException.badRequest("PAYLOAD_INVALID", message);
            }
            return payload;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw ApiException.badRequest("JSON_INVALID", "Telemetry payload must be valid JSON");
        }
    }

    private String canonicalRequest(String deviceId, Long timestamp, String nonce, String payloadHash) {
        return "POST" + "\n" +
                TELEMETRY_PATH + "\n" +
                deviceId + "\n" +
                timestamp + "\n" +
                nonce + "\n" +
                payloadHash;
    }

    private String required(String value, String name) {
        if (value == null || value.isBlank()) {
            throw ApiException.badRequest("HEADER_REQUIRED", "Missing " + name);
        }
        return value.trim();
    }
}
