package com.example.coldchain.service;

import com.example.coldchain.dto.AlertView;
import com.example.coldchain.dto.TelemetryView;
import com.example.coldchain.entity.Device;
import com.example.coldchain.entity.TelemetryRecord;
import com.example.coldchain.exception.ApiException;
import com.example.coldchain.repository.AlertRepository;
import com.example.coldchain.repository.DeviceRepository;
import com.example.coldchain.repository.ShipmentRepository;
import com.example.coldchain.repository.TelemetryRecordRepository;
import com.example.coldchain.util.HashUtil;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ShipmentQueryService {
    private static final String TELEMETRY_PATH = "/api/telemetry";

    private final ShipmentRepository shipmentRepository;
    private final TelemetryRecordRepository telemetryRepository;
    private final AlertRepository alertRepository;
    private final DeviceRepository deviceRepository;
    private final SignatureService signatureService;
    private final RecordHashService recordHashService;
    private final ObjectMapper objectMapper;

    public ShipmentQueryService(ShipmentRepository shipmentRepository,
                                TelemetryRecordRepository telemetryRepository,
                                AlertRepository alertRepository,
                                DeviceRepository deviceRepository,
                                SignatureService signatureService,
                                RecordHashService recordHashService,
                                ObjectMapper objectMapper) {
        this.shipmentRepository = shipmentRepository;
        this.telemetryRepository = telemetryRepository;
        this.alertRepository = alertRepository;
        this.deviceRepository = deviceRepository;
        this.signatureService = signatureService;
        this.recordHashService = recordHashService;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public Page<TelemetryView> telemetry(String shipmentCode, Pageable pageable) {
        ensureShipmentExists(shipmentCode);
        return telemetryRepository.findByShipmentCodeOrderByCreatedAtDesc(shipmentCode, pageable)
                .map(t -> {
                    List<String> issues = verifyIntegrity(t, true, new HashMap<>());
                    return new TelemetryView(
                            t.getId(), t.getDeviceId(), t.getShipmentCode(),
                            t.getTemperature(), t.getHumidity(), t.getRssi(), t.getLat(), t.getLng(), t.getBattery(),
                            t.getDeviceTimestamp(), t.getPayloadHash(), t.getRecordHash(), t.getCreatedAt(),
                            !issues.isEmpty(), issues
                    );
                });
    }

    /**
     * Tái lập liên kết hash chain theo từng thiết bị (thứ tự thời gian tăng dần):
     * previous_hash của bản ghi phải khớp record_hash của bản ghi liền trước (hoặc GENESIS).
     */
    private Map<UUID, Boolean> computeChainLinkage(List<TelemetryRecord> records) {
        List<TelemetryRecord> asc = new ArrayList<>(records);
        asc.sort(Comparator.comparing(TelemetryRecord::getCreatedAt).thenComparing(TelemetryRecord::getDeviceTimestamp));
        Map<String, String> lastHashByDevice = new HashMap<>();
        Map<UUID, Boolean> chainOk = new HashMap<>();
        for (TelemetryRecord r : asc) {
            String expectedPrev = lastHashByDevice.getOrDefault(r.getDeviceId(), "GENESIS");
            chainOk.put(r.getId(), expectedPrev.equals(r.getPreviousHash()));
            lastHashByDevice.put(r.getDeviceId(), r.getRecordHash());
        }
        return chainOk;
    }

    /** Tính lại toàn bộ và trả về danh sách điểm bất thường (rỗng = toàn vẹn). */
    private List<String> verifyIntegrity(TelemetryRecord t, boolean chainOk, Map<String, Device> deviceCache) {
        List<String> issues = new ArrayList<>();

        // 1. payload_hash phải = SHA256(raw_payload)
        String recomputedPayloadHash = HashUtil.sha256Hex(t.getRawPayload());
        boolean payloadHashOk = recomputedPayloadHash.equals(t.getPayloadHash());
        if (!payloadHashOk) issues.add("PAYLOAD_HASH_MISMATCH");

        // 2. Các cột hiển thị phải khớp với raw_payload (bắt sửa trực tiếp cột trong DB)
        try {
            JsonNode p = objectMapper.readTree(t.getRawPayload());
            if (!textEquals(p, "shipment_code", t.getShipmentCode())) issues.add("COLUMN_MISMATCH:shipment_code");
            if (!decEquals(p, "temperature", t.getTemperature())) issues.add("COLUMN_MISMATCH:temperature");
            if (!decEquals(p, "humidity", t.getHumidity())) issues.add("COLUMN_MISMATCH:humidity");
            if (!decEquals(p, "lat", t.getLat())) issues.add("COLUMN_MISMATCH:lat");
            if (!decEquals(p, "lng", t.getLng())) issues.add("COLUMN_MISMATCH:lng");
            if (!intEquals(p, "rssi", t.getRssi())) issues.add("COLUMN_MISMATCH:rssi");
            if (!intEquals(p, "battery", t.getBattery())) issues.add("COLUMN_MISMATCH:battery");
        } catch (Exception e) {
            issues.add("PAYLOAD_UNPARSEABLE");
        }

        // 3. record_hash = HMAC(secret, deviceId|timestamp|payloadHash|signature|previousHash)
        String recomputedRecordHash = recordHashService.recordHash(
                t.getDeviceId(), t.getDeviceTimestamp(), t.getPayloadHash(), t.getSignature(), t.getPreviousHash());
        if (!recomputedRecordHash.equals(t.getRecordHash())) issues.add("RECORD_HASH_MISMATCH");

        // 4. Liên kết chuỗi hash giữa các bản ghi
        if (!chainOk) issues.add("CHAIN_BROKEN");

        // 5. canonical_request phải khớp các trường đã ký
        String expectedCanonical = "POST\n" + TELEMETRY_PATH + "\n" + t.getDeviceId() + "\n"
                + t.getDeviceTimestamp() + "\n" + t.getNonce() + "\n" + t.getPayloadHash();
        if (!expectedCanonical.equals(t.getCanonicalRequest())) issues.add("CANONICAL_MISMATCH");

        // 6. Chữ ký số ECDSA phải hợp lệ với public key của thiết bị
        Device device = deviceCache.computeIfAbsent(t.getDeviceId(),
                id -> deviceRepository.findById(id).orElse(null));
        if (device == null) {
            issues.add("DEVICE_MISSING");
        } else if (!signatureService.verify(device.getPublicKeyPem(), device.getSignatureAlgorithm(),
                t.getCanonicalRequest(), t.getSignature())) {
            issues.add("SIGNATURE_INVALID");
        }

        return issues;
    }

    private boolean textEquals(JsonNode p, String field, String expected) {
        if (!p.hasNonNull(field)) return expected == null;
        return p.get(field).asText().equals(expected);
    }

    private boolean decEquals(JsonNode p, String field, BigDecimal expected) {
        if (!p.hasNonNull(field)) return expected == null;
        if (expected == null) return false;
        try {
            return new BigDecimal(p.get(field).asText()).compareTo(expected) == 0;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private boolean intEquals(JsonNode p, String field, Integer expected) {
        if (!p.hasNonNull(field)) return expected == null;
        if (expected == null) return false;
        return p.get(field).asInt() == expected;
    }

    @Transactional(readOnly = true)
    public Page<AlertView> alerts(String shipmentCode, Pageable pageable) {
        ensureShipmentExists(shipmentCode);
        return alertRepository.findByShipmentCodeOrderByCreatedAtDesc(shipmentCode, pageable)
                .map(a -> new AlertView(
                        a.getId(),
                        a.getShipmentCode(),
                        a.getDeviceId(),
                        a.getType().name(),
                        a.getLevel().name(),
                        a.getMessage(),
                        a.getCreatedAt()
                ));
    }

    private void ensureShipmentExists(String shipmentCode) {
        if (!shipmentRepository.existsById(shipmentCode)) {
            throw ApiException.notFound("SHIPMENT_NOT_FOUND", "Shipment does not exist");
        }
    }
}
