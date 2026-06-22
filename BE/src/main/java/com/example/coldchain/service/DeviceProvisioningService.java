package com.example.coldchain.service;

import com.example.coldchain.config.SecurityProperties;
import com.example.coldchain.dto.DeviceVerifyRequest;
import com.example.coldchain.dto.DeviceVerifyResponse;
import com.example.coldchain.entity.Device;
import com.example.coldchain.entity.Shipment;
import com.example.coldchain.entity.VerifyCode;
import com.example.coldchain.entity.enums.DeviceStatus;
import com.example.coldchain.entity.enums.VerifyCodeStatus;
import com.example.coldchain.exception.ApiException;
import com.example.coldchain.repository.DeviceRepository;
import com.example.coldchain.repository.ShipmentRepository;
import com.example.coldchain.repository.VerifyCodeRepository;
import com.example.coldchain.util.ApiKeyUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class DeviceProvisioningService {
    private final DeviceRepository deviceRepository;
    private final VerifyCodeRepository verifyCodeRepository;
    private final ShipmentRepository shipmentRepository;
    private final SignatureService signatureService;
    private final AuditService auditService;
    private final SecurityProperties securityProperties;

    public DeviceProvisioningService(DeviceRepository deviceRepository,
                                     VerifyCodeRepository verifyCodeRepository,
                                     ShipmentRepository shipmentRepository,
                                     SignatureService signatureService,
                                     AuditService auditService,
                                     SecurityProperties securityProperties) {
        this.deviceRepository = deviceRepository;
        this.verifyCodeRepository = verifyCodeRepository;
        this.shipmentRepository = shipmentRepository;
        this.signatureService = signatureService;
        this.auditService = auditService;
        this.securityProperties = securityProperties;
    }

    @Transactional
    public DeviceVerifyResponse verify(DeviceVerifyRequest request) {
        String deviceId = request.deviceId().trim();
        String verifyCodeValue = request.verifyCode().trim();
        String publicKeyPem = request.publicKeyPem().trim();

        if (deviceRepository.existsById(deviceId)) {
            auditService.fail("DEVICE", deviceId, "DEVICE_VERIFY", "Device already exists");
            throw ApiException.conflict("DEVICE_ALREADY_REGISTERED", "Device already registered");
        }

        VerifyCode verifyCode = verifyCodeRepository.findForUpdate(verifyCodeValue)
                .orElseThrow(() -> ApiException.badRequest("VERIFY_CODE_INVALID", "Verify code does not exist"));

        Instant now = Instant.now();
        if (!verifyCode.isAvailableAt(now)) {
            verifyCode.setStatus(verifyCode.getExpiresAt().isBefore(now) ? VerifyCodeStatus.EXPIRED : verifyCode.getStatus());
            auditService.fail("DEVICE", deviceId, "DEVICE_VERIFY", "Verify code unavailable");
            throw ApiException.badRequest("VERIFY_CODE_UNAVAILABLE", "Verify code was used or expired");
        }

        Shipment shipment = shipmentRepository.findById(verifyCode.getShipmentCode())
                .orElseThrow(() -> ApiException.badRequest("SHIPMENT_NOT_FOUND", "Shipment bound to verify code does not exist"));

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

        Device device = new Device();
        device.setDeviceId(deviceId);
        device.setShipmentCode(shipment.getShipmentCode());
        device.setApiKeyHash(apiKeyHash);
        device.setPublicKeyPem(publicKeyPem);
        device.setSignatureAlgorithm(algorithm);
        device.setStatus(DeviceStatus.ACTIVE);
        deviceRepository.save(device);

        verifyCode.setStatus(VerifyCodeStatus.USED);
        verifyCode.setUsedAt(now);
        verifyCode.setUsedByDeviceId(deviceId);

        auditService.success("DEVICE", deviceId, "DEVICE_VERIFY", "Device provisioned for shipment " + shipment.getShipmentCode());
        return new DeviceVerifyResponse(deviceId, apiKey, DeviceStatus.ACTIVE.name(), shipment.getShipmentCode());
    }

    private void validateAllowedAlgorithm(String algorithm) {
        if (!"SHA256withECDSA".equals(algorithm) && !"SHA256withRSA".equals(algorithm)) {
            throw ApiException.badRequest("SIGNATURE_ALGORITHM_UNSUPPORTED", "Only SHA256withECDSA and SHA256withRSA are supported");
        }
    }
}
