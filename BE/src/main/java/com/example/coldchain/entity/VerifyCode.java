package com.example.coldchain.entity;

import com.example.coldchain.entity.enums.VerifyCodeStatus;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "verify_codes")
public class VerifyCode {
    @Id
    @Column(name = "verify_code", nullable = false, length = 128)
    private String verifyCode;

    // Mã kích hoạt thiết bị không thuộc đơn ship nào -> null.
    @Column(name = "shipment_code", length = 64)
    private String shipmentCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private VerifyCodeStatus status;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "used_at")
    private Instant usedAt;

    @Column(name = "used_by_device_id", length = 128)
    private String usedByDeviceId;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
        if (status == null) status = VerifyCodeStatus.UNUSED;
    }

    public boolean isAvailableAt(Instant now) {
        return status == VerifyCodeStatus.UNUSED && expiresAt != null && expiresAt.isAfter(now);
    }

    public String getVerifyCode() { return verifyCode; }
    public void setVerifyCode(String verifyCode) { this.verifyCode = verifyCode; }
    public String getShipmentCode() { return shipmentCode; }
    public void setShipmentCode(String shipmentCode) { this.shipmentCode = shipmentCode; }
    public VerifyCodeStatus getStatus() { return status; }
    public void setStatus(VerifyCodeStatus status) { this.status = status; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUsedAt() { return usedAt; }
    public void setUsedAt(Instant usedAt) { this.usedAt = usedAt; }
    public String getUsedByDeviceId() { return usedByDeviceId; }
    public void setUsedByDeviceId(String usedByDeviceId) { this.usedByDeviceId = usedByDeviceId; }
}
