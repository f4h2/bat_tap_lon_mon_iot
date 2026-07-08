package com.example.coldchain.service;

import com.example.coldchain.config.SecurityProperties;
import com.example.coldchain.dto.DeviceResetResponse;
import com.example.coldchain.dto.DeviceVerifyRequest;
import com.example.coldchain.dto.DeviceVerifyResponse;
import com.example.coldchain.entity.Device;
import com.example.coldchain.entity.VerifyCode;
import com.example.coldchain.entity.enums.DeviceStatus;
import com.example.coldchain.entity.enums.VerifyCodeStatus;
import com.example.coldchain.exception.ApiException;
import com.example.coldchain.repository.DeviceRepository;
import com.example.coldchain.repository.VerifyCodeRepository;
import com.example.coldchain.util.ApiKeyUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * PHA 1 — Kích hoạt thiết bị (device activation). Chỉ đăng ký danh tính + cấp api_key.
 * KHÔNG gắn đơn ship ở bước này (shipment_code = null). Việc gắn đơn ship do bind thực hiện.
 * Cho phép re-activation: thiết bị reset rồi kích hoạt lại bằng mã kích hoạt mới.
 */
@Service
public class DeviceProvisioningService {
    private final DeviceRepository deviceRepository;
    private final VerifyCodeRepository verifyCodeRepository;
    private final SignatureService signatureService;
    private final AuditService auditService;
    private final SecurityProperties securityProperties;

    public DeviceProvisioningService(DeviceRepository deviceRepository,
                                     VerifyCodeRepository verifyCodeRepository,
                                     SignatureService signatureService,
                                     AuditService auditService,
                                     SecurityProperties securityProperties) {
        this.deviceRepository = deviceRepository;
        this.verifyCodeRepository = verifyCodeRepository;
        this.signatureService = signatureService;
        this.auditService = auditService;
        this.securityProperties = securityProperties;
    }

    @Transactional
    public DeviceVerifyResponse verify(DeviceVerifyRequest request) {
        String deviceId = request.deviceId().trim();
        String activationCodeValue = request.verifyCode().trim();
        String publicKeyPem = request.publicKeyPem().trim();

        VerifyCode code = verifyCodeRepository.findForUpdate(activationCodeValue)
                .orElseThrow(() -> ApiException.badRequest("ACTIVATION_CODE_INVALID", "Activation code does not exist"));

        Instant now = Instant.now();
        if (!code.isAvailableAt(now)) {
            code.setStatus(code.getExpiresAt().isBefore(now) ? VerifyCodeStatus.EXPIRED : code.getStatus());
            auditService.fail("DEVICE", deviceId, "DEVICE_ACTIVATE", "Activation code unavailable");
            throw ApiException.badRequest("ACTIVATION_CODE_UNAVAILABLE", "Activation code was used or expired");
        }

        signatureService.validatePublicKey(publicKeyPem);
        String detectedAlgorithm = signatureService.detectAlgorithm(publicKeyPem);
        String algorithm = request.signatureAlgorithm() == null || request.signatureAlgorithm().isBlank()
                ? detectedAlgorithm
                : request.signatureAlgorithm().trim();
        validateAllowedAlgorithm(algorithm);
        if (!algorithm.equals(detectedAlgorithm)) {
            throw ApiException.badRequest("SIGNATURE_ALGORITHM_MISMATCH",
                    "Signature algorithm does not match public key type. Expected " + detectedAlgorithm);
        }

        String apiKey = ApiKeyUtil.generateApiKey();
        String apiKeyHash = ApiKeyUtil.hmacSha256Hex(apiKey, securityProperties.apiKeyPepper());

        boolean existing = deviceRepository.existsById(deviceId);
        Device device = existing ? deviceRepository.findById(deviceId).orElseThrow() : new Device();
        device.setDeviceId(deviceId);
        device.setShipmentCode(null);              // kích hoạt xong nhưng chưa gắn đơn ship
        device.setApiKeyHash(apiKeyHash);
        device.setPublicKeyPem(publicKeyPem);
        device.setSignatureAlgorithm(algorithm);
        device.setStatus(DeviceStatus.ACTIVE);
        device.setActivatedAt(now);
        deviceRepository.save(device);

        code.setStatus(VerifyCodeStatus.USED);
        code.setUsedAt(now);
        code.setUsedByDeviceId(deviceId);

        auditService.success("DEVICE", deviceId, "DEVICE_ACTIVATE", existing ? "Device re-activated" : "Device activated");
        return new DeviceVerifyResponse(deviceId, apiKey, DeviceStatus.ACTIVE.name(), null);
    }

    /**
     * Thiết bị báo đã bị RESET (xóa credentials phía thiết bị) -> chuyển sang DISABLED và gỡ đơn ship.
     * Xác thực bằng api_key hiện tại (thiết bị gọi trước khi wipe NVS). Sau đó telemetry của thiết bị
     * sẽ bị từ chối cho tới khi kích hoạt lại (verify).
     */
    @Transactional
    public DeviceResetResponse reset(String deviceId, String apiKey) {
        String id = require(deviceId, "X-Device-Id");
        String key = require(apiKey, "X-Api-Key");
        Device device = deviceRepository.findById(id)
                .orElseThrow(() -> ApiException.unauthorized("DEVICE_NOT_FOUND", "Unknown device"));

        String requestHash = ApiKeyUtil.hmacSha256Hex(key, securityProperties.apiKeyPepper());
        if (!ApiKeyUtil.constantTimeEquals(requestHash, device.getApiKeyHash())) {
            auditService.fail("DEVICE", id, "DEVICE_RESET", "Invalid API key");
            throw ApiException.unauthorized("API_KEY_INVALID", "Invalid API key");
        }

        device.setStatus(DeviceStatus.DISABLED);
        device.setShipmentCode(null);   // gỡ gắn đơn ship -> ngừng nhận telemetry
        deviceRepository.save(device);

        auditService.success("DEVICE", id, "DEVICE_RESET", "Device reset -> DISABLED");
        return new DeviceResetResponse(id, DeviceStatus.DISABLED.name());
    }

    private String require(String value, String name) {
        if (value == null || value.isBlank()) {
            throw ApiException.badRequest("HEADER_REQUIRED", "Missing " + name);
        }
        return value.trim();
    }

    private void validateAllowedAlgorithm(String algorithm) {
        if (!"SHA256withECDSA".equals(algorithm) && !"SHA256withRSA".equals(algorithm)) {
            throw ApiException.badRequest("SIGNATURE_ALGORITHM_UNSUPPORTED", "Only SHA256withECDSA and SHA256withRSA are supported");
        }
    }
}
