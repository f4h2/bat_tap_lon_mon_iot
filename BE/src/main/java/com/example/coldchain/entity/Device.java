package com.example.coldchain.entity;

import com.example.coldchain.entity.enums.DeviceStatus;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "devices")
public class Device {
    @Id
    @Column(name = "device_id", nullable = false, length = 128)
    private String deviceId;

    @Column(name = "shipment_code", nullable = false, length = 64)
    private String shipmentCode;

    @Column(name = "api_key_hash", nullable = false, length = 128)
    private String apiKeyHash;

    @Column(name = "public_key_pem", nullable = false, columnDefinition = "text")
    private String publicKeyPem;

    @Column(name = "signature_algorithm", nullable = false, length = 64)
    private String signatureAlgorithm;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private DeviceStatus status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "activated_at", nullable = false)
    private Instant activatedAt;

    @Column(name = "last_seen_at")
    private Instant lastSeenAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @PrePersist
    void prePersist() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        if (activatedAt == null) activatedAt = now;
        if (status == null) status = DeviceStatus.ACTIVE;
    }

    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String deviceId) { this.deviceId = deviceId; }
    public String getShipmentCode() { return shipmentCode; }
    public void setShipmentCode(String shipmentCode) { this.shipmentCode = shipmentCode; }
    public String getApiKeyHash() { return apiKeyHash; }
    public void setApiKeyHash(String apiKeyHash) { this.apiKeyHash = apiKeyHash; }
    public String getPublicKeyPem() { return publicKeyPem; }
    public void setPublicKeyPem(String publicKeyPem) { this.publicKeyPem = publicKeyPem; }
    public String getSignatureAlgorithm() { return signatureAlgorithm; }
    public void setSignatureAlgorithm(String signatureAlgorithm) { this.signatureAlgorithm = signatureAlgorithm; }
    public DeviceStatus getStatus() { return status; }
    public void setStatus(DeviceStatus status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getActivatedAt() { return activatedAt; }
    public void setActivatedAt(Instant activatedAt) { this.activatedAt = activatedAt; }
    public Instant getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(Instant lastSeenAt) { this.lastSeenAt = lastSeenAt; }
    public Long getVersion() { return version; }
    public void setVersion(Long version) { this.version = version; }
}
