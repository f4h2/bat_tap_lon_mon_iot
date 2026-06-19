package com.example.coldchain.repository;

import com.example.coldchain.entity.TelemetryRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TelemetryRecordRepository extends JpaRepository<TelemetryRecord, UUID> {
    Optional<TelemetryRecord> findTopByDeviceIdOrderByCreatedAtDesc(String deviceId);
    List<TelemetryRecord> findByShipmentCodeOrderByCreatedAtDesc(String shipmentCode);
}
