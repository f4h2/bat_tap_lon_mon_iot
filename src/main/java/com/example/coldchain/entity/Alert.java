package com.example.coldchain.entity;

import com.example.coldchain.entity.enums.AlertLevel;
import com.example.coldchain.entity.enums.AlertType;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "alerts")
public class Alert {
    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "shipment_code", nullable = false, length = 64)
    private String shipmentCode;

    @Column(name = "device_id", nullable = false, length = 128)
    private String deviceId;

    @Column(name = "telemetry_id", nullable = false)
    private UUID telemetryId;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 64)
    private AlertType type;

    @Enumerated(EnumType.STRING)
    @Column(name = "level", nullable = false, length = 32)
    private AlertLevel level;

    @Column(name = "message", nullable = false, length = 500)
    private String message;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (id == null) id = UUID.randomUUID();
        if (createdAt == null) createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getShipmentCode() { return shipmentCode; }
    public void setShipmentCode(String shipmentCode) { this.shipmentCode = shipmentCode; }
    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String deviceId) { this.deviceId = deviceId; }
    public UUID getTelemetryId() { return telemetryId; }
    public void setTelemetryId(UUID telemetryId) { this.telemetryId = telemetryId; }
    public AlertType getType() { return type; }
    public void setType(AlertType type) { this.type = type; }
    public AlertLevel getLevel() { return level; }
    public void setLevel(AlertLevel level) { this.level = level; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
