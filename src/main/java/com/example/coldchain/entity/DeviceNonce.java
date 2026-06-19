package com.example.coldchain.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "device_nonces", uniqueConstraints = {
        @UniqueConstraint(name = "uk_device_nonce", columnNames = {"device_id", "nonce"})
})
public class DeviceNonce {
    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "device_id", nullable = false, length = 128)
    private String deviceId;

    @Column(name = "nonce", nullable = false, length = 128)
    private String nonce;

    @Column(name = "device_timestamp", nullable = false)
    private Long deviceTimestamp;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (id == null) id = UUID.randomUUID();
        if (createdAt == null) createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String deviceId) { this.deviceId = deviceId; }
    public String getNonce() { return nonce; }
    public void setNonce(String nonce) { this.nonce = nonce; }
    public Long getDeviceTimestamp() { return deviceTimestamp; }
    public void setDeviceTimestamp(Long deviceTimestamp) { this.deviceTimestamp = deviceTimestamp; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
