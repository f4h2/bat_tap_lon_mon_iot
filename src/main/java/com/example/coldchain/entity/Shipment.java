package com.example.coldchain.entity;

import com.example.coldchain.entity.enums.ShipmentStatus;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "shipments")
public class Shipment {
    @Id
    @Column(name = "shipment_code", nullable = false, length = 64)
    private String shipmentCode;

    @Column(name = "item_type", nullable = false, length = 255)
    private String itemType;

    @Column(name = "min_temperature", precision = 8, scale = 2)
    private BigDecimal minTemperature;

    @Column(name = "max_temperature", precision = 8, scale = 2)
    private BigDecimal maxTemperature;

    @Column(name = "min_humidity", precision = 8, scale = 2)
    private BigDecimal minHumidity;

    @Column(name = "max_humidity", precision = 8, scale = 2)
    private BigDecimal maxHumidity;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private ShipmentStatus status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
        if (status == null) status = ShipmentStatus.ACTIVE;
    }

    public String getShipmentCode() { return shipmentCode; }
    public void setShipmentCode(String shipmentCode) { this.shipmentCode = shipmentCode; }
    public String getItemType() { return itemType; }
    public void setItemType(String itemType) { this.itemType = itemType; }
    public BigDecimal getMinTemperature() { return minTemperature; }
    public void setMinTemperature(BigDecimal minTemperature) { this.minTemperature = minTemperature; }
    public BigDecimal getMaxTemperature() { return maxTemperature; }
    public void setMaxTemperature(BigDecimal maxTemperature) { this.maxTemperature = maxTemperature; }
    public BigDecimal getMinHumidity() { return minHumidity; }
    public void setMinHumidity(BigDecimal minHumidity) { this.minHumidity = minHumidity; }
    public BigDecimal getMaxHumidity() { return maxHumidity; }
    public void setMaxHumidity(BigDecimal maxHumidity) { this.maxHumidity = maxHumidity; }
    public ShipmentStatus getStatus() { return status; }
    public void setStatus(ShipmentStatus status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
